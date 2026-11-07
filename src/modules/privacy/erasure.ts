import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  candidateCredentials,
  candidateDocuments,
  candidateEducation,
  candidateExperience,
  candidateLanguages,
  candidatePortfolioItems,
  candidatePreferredLocations,
  candidatePrivacySettings,
  candidateProfiles,
  candidateSkills,
  files,
  jobAlerts,
  messageThreadParticipants,
  notificationPreferences,
  notifications,
  oauthAccounts,
  organizationMembers,
  savedJobs,
  supportTickets,
  userTwoFactor,
  users,
  verificationTokens,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { eraseAnalyticsForUser } from "@/modules/analytics/dsar";
import { audit } from "@/modules/audit";
import { softDeleteFile } from "@/modules/files";
import type { StaffContext } from "@/modules/identity/authz";
import { invalidateUserSessions } from "@/modules/identity/session";

import { ERASABLE_FILE_PURPOSES, RETENTION_EXCEPTIONS } from "./constants";

/**
 * Account erasure for a deletion request (DPDP Act 2023 s.12(3)). The account row is kept (other
 * records reference it) but closed and anonymised; personal data without a retention obligation is
 * deleted; records the law requires us to keep stay, referencing the anonymised account
 * (RETENTION_EXCEPTIONS). Idempotent: re-running on an erased account only repeats the deletions.
 */

export type ErasureSummary = {
  filesDeleted: number;
  candidateRowsDeleted: number;
  notificationsDeleted: number;
  analytics: { sessions: number; events: number };
  membershipsDisabled: number;
  retained: string[];
};

const ERASED_NAME = "Deleted user";

/** Delete rows inside a savepoint: rows still referenced by a retained record (restrict FK) are kept. */
async function deleteKeepingReferenced(tx: DbOrTx, label: string, run: (sp: DbOrTx) => Promise<number>): Promise<number> {
  try {
    return await tx.transaction(async (sp) => run(sp));
  } catch (error) {
    logger.warn("Erasure kept rows that are still referenced", { table: label, error: error instanceof Error ? error.message : String(error) });
    return 0;
  }
}

export async function eraseAccount(ctx: StaffContext, input: { userId: string; requestId: string; requestCode: string }): Promise<ErasureSummary> {
  const { userId } = input;
  const now = new Date();

  const ownedFiles = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerUserId, userId), isNull(files.deletedAt), inArray(files.purpose, [...ERASABLE_FILE_PURPOSES])));

  const summary = await db.transaction(async (tx) => {
    let candidateRowsDeleted = 0;
    const [profile] = await tx.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
    if (profile) {
      const cid = profile.id;
      const simple = [
        ["candidate_education", candidateEducation],
        ["candidate_experience", candidateExperience],
        ["candidate_skills", candidateSkills],
        ["candidate_languages", candidateLanguages],
        ["candidate_portfolio_items", candidatePortfolioItems],
        ["candidate_preferred_locations", candidatePreferredLocations],
        ["candidate_documents", candidateDocuments],
        ["candidate_credentials", candidateCredentials],
        ["candidate_privacy_settings", candidatePrivacySettings],
      ] as const;
      for (const [label, table] of simple) {
        candidateRowsDeleted += await deleteKeepingReferenced(tx, label, async (sp) => (await sp.delete(table).where(eq(table.candidateId, cid)).returning({ id: table.candidateId })).length);
      }
      await tx
        .update(candidateProfiles)
        .set({
          headline: null,
          about: null,
          careerObjective: null,
          currentJobTitle: null,
          currentEmployerName: null,
          preferredRoles: [],
          preferredRolesText: null,
          skillNamesCache: [],
          skillsText: null,
          city: null,
          stateRegion: null,
          legalName: null,
          dateOfBirth: null,
          gender: null,
          genderSelfDescription: null,
          passportNumberEncrypted: null,
          passportNumberLast4: null,
          passportNumberHash: null,
          passportExpiry: null,
          photoFileId: null,
          resumeFileId: null,
          expectedSalaryMinor: null,
          expectedSalaryCurrency: null,
          expectedSalaryPeriod: null,
          visibility: "hidden",
          isOpenToWork: false,
          openToOverseas: false,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(candidateProfiles.id, cid));
    }

    await tx.delete(savedJobs).where(eq(savedJobs.userId, userId));
    await tx.delete(jobAlerts).where(eq(jobAlerts.userId, userId));
    const deletedNotifications = await tx.delete(notifications).where(eq(notifications.userId, userId)).returning({ id: notifications.id });
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    await tx.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId));
    await tx.delete(userTwoFactor).where(eq(userTwoFactor.userId, userId));
    await tx.delete(verificationTokens).where(eq(verificationTokens.userId, userId));
    const memberships = await tx
      .update(organizationMembers)
      .set({ status: "disabled", updatedAt: now })
      .where(and(eq(organizationMembers.userId, userId), inArray(organizationMembers.status, ["active", "invited"])))
      .returning({ id: organizationMembers.id });
    await tx.update(messageThreadParticipants).set({ removedAt: now }).where(and(eq(messageThreadParticipants.userId, userId), isNull(messageThreadParticipants.removedAt)));
    // Ticket copies of the contact details (the ticket itself stays: grievance register / service records).
    await tx.update(supportTickets).set({ requesterName: ERASED_NAME, requesterEmail: null, requesterPhone: null }).where(eq(supportTickets.requesterUserId, userId));

    await tx
      .update(users)
      .set({
        email: null,
        emailVerifiedAt: null,
        phone: null,
        phoneVerifiedAt: null,
        passwordHash: null,
        displayName: ERASED_NAME,
        avatarFileId: null,
        status: "closed",
        statusReason: `Erased (data request ${input.requestCode})`,
        preferences: {},
        timezone: null,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    for (const file of ownedFiles) await softDeleteFile(file.id, { actorUserId: ctx.user.id, reason: `Data request ${input.requestCode}`, tx });

    await audit({
      action: "privacy.account_erased",
      entityType: "user",
      entityId: userId,
      metadata: { requestId: input.requestId, files: ownedFiles.length, candidateRows: candidateRowsDeleted, notifications: deletedNotifications.length },
      actorUserId: ctx.user.id,
      actorType: "staff",
      tx,
    });
    return { candidateRowsDeleted, notificationsDeleted: deletedNotifications.length, membershipsDisabled: memberships.length };
  });

  await invalidateUserSessions(userId);
  const analytics = await eraseAnalyticsForUser({ kind: "staff", staff: ctx }, userId);

  return {
    filesDeleted: ownedFiles.length,
    candidateRowsDeleted: summary.candidateRowsDeleted,
    notificationsDeleted: summary.notificationsDeleted,
    analytics,
    membershipsDisabled: summary.membershipsDisabled,
    retained: RETENTION_EXCEPTIONS.map((r) => `${r.label}: ${r.reason}`),
  };
}
