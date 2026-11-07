import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  applications,
  candidateProfiles,
  files,
  jobs,
  notificationPreferences,
  notifications,
  organizationMembers,
  organizations,
  supportTickets,
  ticketMessages,
  users,
} from "@/db/schema";
import { summarizeAnalyticsForUser } from "@/modules/analytics/dsar";
import { buildCandidateDataExport } from "@/modules/candidates/export";
import type { StaffContext } from "@/modules/identity/authz";
import { listConsentHistory } from "@/modules/identity/consent";

import { exportExpiresAt } from "./constants";

/**
 * Personal data bundle for an access / export request: everything the person can see about themselves
 * across modules. Internal notes, staff ratings, rejection reasons, knockout flags and other parties'
 * data are never included. The candidate part comes from the candidates module (which audits it).
 */

const iso = (v: Date | null | undefined): string | null => (v ? v.toISOString() : null);

export type PersonalDataBundle = {
  format: "venkat-sai-global.personal-data";
  version: 1;
  generatedAt: string;
  availableUntil: string;
  request: { code: string; type: string };
  account: Record<string, unknown>;
  candidate: unknown;
  applications: Record<string, unknown>[];
  organizationMemberships: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  notificationPreferences: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  supportRequests: Record<string, unknown>[];
  analytics: unknown;
  files: Record<string, unknown>[];
  notes: string[];
};

export async function buildPersonalDataBundle(ctx: StaffContext, userId: string, request: { code: string; type: string }): Promise<PersonalDataBundle> {
  const [account] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      phone: users.phone,
      phoneVerifiedAt: users.phoneVerifiedAt,
      locale: users.locale,
      timezone: users.timezone,
      status: users.status,
      signupSource: users.signupSource,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) throw new Error("Account not found for export");

  const [profile] = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
  const reason = `Data request ${request.code}`;

  const [candidate, apps, memberships, consents, prefs, notes, tickets, analytics, ownedFiles] = await Promise.all([
    profile ? buildCandidateDataExport({ kind: "staff", ctx, candidateId: profile.id, reason }) : Promise.resolve(null),
    profile
      ? db
          .select({
            code: applications.code,
            jobCode: jobs.code,
            jobTitle: jobs.title,
            status: applications.status,
            source: applications.source,
            coverLetter: applications.coverLetter,
            expectedSalaryMinor: applications.expectedSalaryMinor,
            expectedSalaryCurrency: applications.expectedSalaryCurrency,
            expectedSalaryPeriod: applications.expectedSalaryPeriod,
            consentToShareAt: applications.consentToShareAt,
            sharedWithEmployerAt: applications.sharedWithEmployerAt,
            withdrawnAt: applications.withdrawnAt,
            withdrawalReason: applications.withdrawalReason,
            hiredAt: applications.hiredAt,
            createdAt: applications.createdAt,
          })
          .from(applications)
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .where(eq(applications.candidateId, profile.id))
          .orderBy(desc(applications.createdAt))
      : Promise.resolve([]),
    db
      .select({ organization: organizations.name, type: organizations.type, status: organizationMembers.status, jobTitle: organizationMembers.jobTitle, since: organizationMembers.createdAt })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId)),
    listConsentHistory(userId),
    db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
    db
      .select({ title: notifications.title, body: notifications.body, category: notifications.category, createdAt: notifications.createdAt, readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(5000),
    db
      .select({
        id: supportTickets.id,
        code: supportTickets.code,
        grievanceCode: supportTickets.grievanceCode,
        subject: supportTickets.subject,
        category: supportTickets.category,
        status: supportTickets.status,
        createdAt: supportTickets.createdAt,
        resolvedAt: supportTickets.resolvedAt,
      })
      .from(supportTickets)
      .where(eq(supportTickets.requesterUserId, userId))
      .orderBy(desc(supportTickets.createdAt)),
    summarizeAnalyticsForUser({ kind: "staff", staff: ctx }, userId),
    db
      .select({ id: files.id, name: files.originalName, type: files.mimeType, size: files.sizeBytes, purpose: files.purpose, uploadedAt: files.createdAt })
      .from(files)
      .where(and(eq(files.ownerUserId, userId), isNull(files.deletedAt))),
  ]);

  // Public messages of the person's tickets only (internal notes are never exported).
  const ticketIds = tickets.map((t) => t.id);
  const messages = ticketIds.length
    ? await db
        .select({ ticketId: ticketMessages.ticketId, authorType: ticketMessages.authorType, body: ticketMessages.body, createdAt: ticketMessages.createdAt })
        .from(ticketMessages)
        .where(and(inArray(ticketMessages.ticketId, ticketIds), eq(ticketMessages.isInternal, false)))
        .orderBy(ticketMessages.createdAt)
    : [];

  const now = new Date();
  return {
    format: "venkat-sai-global.personal-data",
    version: 1,
    generatedAt: now.toISOString(),
    availableUntil: exportExpiresAt(now).toISOString(),
    request,
    account: { ...account, emailVerifiedAt: iso(account.emailVerifiedAt), phoneVerifiedAt: iso(account.phoneVerifiedAt), lastLoginAt: iso(account.lastLoginAt), createdAt: iso(account.createdAt) },
    candidate,
    applications: apps.map((a) => ({ ...a, consentToShareAt: iso(a.consentToShareAt), sharedWithEmployerAt: iso(a.sharedWithEmployerAt), withdrawnAt: iso(a.withdrawnAt), hiredAt: iso(a.hiredAt), createdAt: iso(a.createdAt) })),
    organizationMemberships: memberships.map((m) => ({ ...m, since: iso(m.since) })),
    consents: consents.map((c) => ({ purpose: c.purpose, granted: c.granted, source: c.source, policyVersion: c.policyVersion, recordedAt: iso(c.createdAt) })),
    notificationPreferences: prefs.map((p) => ({ category: p.category, channel: p.channel, enabled: p.enabled })),
    notifications: notes.map((n) => ({ ...n, createdAt: iso(n.createdAt), readAt: iso(n.readAt) })),
    supportRequests: tickets.map(({ id, ...t }) => ({
      ...t,
      createdAt: iso(t.createdAt),
      resolvedAt: iso(t.resolvedAt),
      messages: messages.filter((m) => m.ticketId === id).map((m) => ({ from: m.authorType === "requester" ? "you" : "Venkat Sai support", body: m.body, at: iso(m.createdAt) })),
    })),
    analytics,
    files: ownedFiles.map((f) => ({ ...f, uploadedAt: iso(f.uploadedAt) })),
    notes: [
      "Files you uploaded are listed under 'files'; download them from your account while it is open.",
      "Internal staff notes and assessments of other people are not personal data you provided and are not included; ask us if you want to know more.",
    ],
  };
}
