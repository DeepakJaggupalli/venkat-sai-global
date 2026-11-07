import "server-only";

import { and, desc, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { batches, enrolments, organizationMembers, organizations, partnerSettlementLines, partnerSettlements, roles } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { nextCode } from "@/lib/codes";
import { ensureCandidateProfile, selfActor, updatePersonalDetails } from "@/modules/candidates/service";
import { personalSchema } from "@/modules/candidates/schemas";
import { addSettlementLine, submitSettlement } from "@/modules/commercial/settlements";
import type { StaffContext } from "@/modules/identity/authz";
import { createBatch, openBatch } from "@/modules/training/batches";
import { batchSchema } from "@/modules/training/schemas";

import { dateOfBirthForAge, e2eEmail, ensureMember, generatePassword, isoDay, loadSessionUser, orgContextFor, upsertPasswordUser, type SeedLog } from "./e2e-helpers";
import { ensureConfirmedEnrolment } from "./e2e-orgs";

/**
 * E2E seed block for the Recruitment Partner and Institution portal specs (ui-recruiter, ui-institution).
 * Called from runE2eSeed() once the partner and institution organisations exist. Local database only.
 *
 *  - Partner team members for permission checks: a member with a custom "settlements only" role
 *    (partner.settlements.view, nothing else) and a member with the template Recruiter role (no settlements).
 *  - A partner settlement waiting for approval (AED, so not INR) the settlements member can attach an invoice
 *    to; its invoice number / file are cleared on every run. The other partner gets one too (must 404).
 *  - An institution member with a custom "placements only" role (institution.placements.manage).
 *  - A dedicated QA batch with four confirmed adult learners for attendance, scores, completion and
 *    certificates, so the shared E2E_INSTITUTION_BATCH_ID learner is never completed or certified. A new QA
 *    batch is opened whenever fewer than two learners of the latest one are still waiting (each spec run
 *    completes and certifies one).
 */

type OrgRow = typeof organizations.$inferSelect;
type Account = { key: string; local: string; name: string };

const PARTNER_FINANCE: Account = { key: "PARTNER_FINANCE", local: "partner-finance", name: "E2E Partner Settlements Member" };
const PARTNER_RECRUITER: Account = { key: "PARTNER_RECRUITER", local: "partner-recruiter", name: "E2E Partner Recruiter Member" };
const INSTITUTION_PLACEMENTS: Account = { key: "INSTITUTION_PLACEMENTS", local: "institution-placements", name: "E2E Institution Placements Member" };

const QA_LEARNERS = [
  { local: "institution-qa-learner-1", name: "E2E QA Learner One" },
  { local: "institution-qa-learner-2", name: "E2E QA Learner Two" },
  { local: "institution-qa-learner-3", name: "E2E QA Learner Three" },
  { local: "institution-qa-learner-4", name: "E2E QA Learner Four" },
] as const;
const QA_BATCH_PREFIX = "E2E QA scoring batch (test)";
const SETTLEMENT_PERIOD = { periodStart: "2026-01-01", periodEnd: "2026-01-31" } as const;

async function ensureAccount(account: Account, kept: Readonly<Record<string, string>>, env: Record<string, string>): Promise<string> {
  const email = e2eEmail(account.local);
  const keptPassword = kept[`E2E_${account.key}_PASSWORD`];
  const password = keptPassword ?? generatePassword({ email, name: account.name });
  const { id } = await upsertPasswordUser({ email, displayName: account.name, password }, { passwordChanged: !keptPassword });
  env[`E2E_${account.key}_EMAIL`] = email;
  env[`E2E_${account.key}_PASSWORD`] = password;
  return id;
}

/** An organisation-specific (custom) role with exactly these permissions. */
async function ensureCustomRole(organizationId: string, scope: OrgType, key: string, name: string, permissions: string[]): Promise<string> {
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.scope, scope), eq(roles.key, key)))
    .limit(1);
  if (existing) {
    await db.update(roles).set({ name, permissions }).where(eq(roles.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(roles).values({ scope, key, name, description: "Test role used by automated end-to-end tests.", permissions, organizationId }).returning({ id: roles.id });
  return row!.id;
}

async function ensureMemberWithRole(organizationId: string, userId: string, roleId: string): Promise<void> {
  await db
    .insert(organizationMembers)
    .values({ organizationId, userId, roleId, status: "active", joinedAt: new Date() })
    .onConflictDoUpdate({ target: [organizationMembers.organizationId, organizationMembers.userId], set: { roleId, status: "active" } });
}

/** A settlement for the fixed QA period in a partner-visible state (pending approval), invoice cleared. */
async function ensurePendingSettlement(staff: StaffContext, partnerOrganizationId: string, currency: string): Promise<string> {
  let [settlement] = await db
    .select()
    .from(partnerSettlements)
    .where(
      and(
        eq(partnerSettlements.partnerOrganizationId, partnerOrganizationId),
        eq(partnerSettlements.periodStart, SETTLEMENT_PERIOD.periodStart),
        eq(partnerSettlements.periodEnd, SETTLEMENT_PERIOD.periodEnd),
        eq(partnerSettlements.currency, currency),
        ne(partnerSettlements.status, "cancelled"),
      ),
    )
    .limit(1);
  if (!settlement) {
    const code = await nextCode("STL");
    [settlement] = await db
      .insert(partnerSettlements)
      .values({ currency, code, partnerOrganizationId, ...SETTLEMENT_PERIOD, notes: "Test settlement used by automated end-to-end tests. Not a real payment.", createdByUserId: staff.user.id })
      .returning();
  }
  if (settlement!.status === "draft") {
    const [line] = await db
      .select({ id: partnerSettlementLines.id })
      .from(partnerSettlementLines)
      .where(and(eq(partnerSettlementLines.settlementId, settlement!.id), isNull(partnerSettlementLines.voidedAt)))
      .limit(1);
    if (!line) await addSettlementLine(staff, { settlementId: settlement!.id, kind: "bonus", description: "E2E test bonus line (not a real payment)", amount: "1500.00" });
    settlement = await submitSettlement(staff, settlement!.id);
  }
  await db.update(partnerSettlements).set({ partnerInvoiceNumber: null, partnerInvoiceFileId: null }).where(eq(partnerSettlements.id, settlement!.id));
  return settlement!.id;
}

async function ensureAdultLearner(person: { local: string; name: string }): Promise<{ userId: string; candidateId: string; displayName: string }> {
  const email = e2eEmail(person.local);
  // Nobody signs in as these learners; the password is random and never written to the env file.
  const { id: userId } = await upsertPasswordUser({ email, displayName: person.name, password: generatePassword({ email, name: person.name }) }, { passwordChanged: false });
  let profile = await ensureCandidateProfile(userId);
  if (!profile.dateOfBirth) {
    profile = await updatePersonalDetails(
      selfActor({ user: await loadSessionUser(userId), candidate: profile }),
      personalSchema.parse({ legalName: person.name, dateOfBirth: dateOfBirthForAge(26), nationalityCode: "IN", currentCountryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam" }),
    );
  }
  return { userId, candidateId: profile.id, displayName: person.name };
}

/** Latest QA batch with at least two learners still waiting to be completed, else a new one. */
async function ensureQaBatch(institution: OrgRow, ownerUserId: string, courseId: string, log: SeedLog): Promise<string> {
  const learners = [];
  for (const person of QA_LEARNERS) learners.push(await ensureAdultLearner(person));
  const [latest] = await db
    .select({ id: batches.id, status: batches.status })
    .from(batches)
    .where(and(eq(batches.courseId, courseId), like(batches.title, `${QA_BATCH_PREFIX}%`)))
    .orderBy(desc(batches.createdAt))
    .limit(1);
  let batchId = latest && ["open", "full", "in_progress"].includes(latest.status) ? latest.id : null;
  if (batchId) {
    const [waiting] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(enrolments)
      .where(and(eq(enrolments.batchId, batchId), inArray(enrolments.status, ["confirmed", "in_progress"])));
    if ((waiting?.value ?? 0) < 2) batchId = null;
  }
  if (!batchId) {
    const ctx = await orgContextFor<"institution">(ownerUserId, institution.id);
    const batch = await createBatch(
      ctx,
      courseId,
      batchSchema.parse({ title: `${QA_BATCH_PREFIX} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, mode: "in_person", capacity: 10, startsOn: isoDay(30), endsOn: isoDay(60), registrationDeadline: isoDay(25), countryCode: "IN", city: "Visakhapatnam" }),
    );
    batchId = (await openBatch(ctx, batch.id)).id;
    log(`  new QA batch ${batchId}`);
    for (const learner of learners) await ensureConfirmedEnrolment({ org: institution, ownerUserId, batchId, learner });
  }
  return batchId;
}

export async function seedPartnerInstitutionQa(opts: {
  staff: StaffContext;
  partnerOrganizationId: string;
  otherPartnerOrganizationId: string;
  institution: OrgRow;
  institutionOwnerUserId: string;
  institutionCourseId: string;
  otherInstitutionCourseId: string;
  keptPasswords: Readonly<Record<string, string>>;
  log: SeedLog;
}): Promise<Record<string, string>> {
  const { staff, log } = opts;
  const env: Record<string, string> = {};

  log("Partner and institution QA:");
  const financeUserId = await ensureAccount(PARTNER_FINANCE, opts.keptPasswords, env);
  const financeRoleId = await ensureCustomRole(opts.partnerOrganizationId, "recruitment_partner", "e2e_settlements", "E2E Settlements only (test)", ["partner.dashboard", "partner.settlements.view"]);
  await ensureMemberWithRole(opts.partnerOrganizationId, financeUserId, financeRoleId);
  const recruiterUserId = await ensureAccount(PARTNER_RECRUITER, opts.keptPasswords, env);
  await ensureMember(opts.partnerOrganizationId, "recruitment_partner", recruiterUserId, "recruiter");

  env.E2E_PARTNER_SETTLEMENT_ID = await ensurePendingSettlement(staff, opts.partnerOrganizationId, "AED");
  env.E2E_OTHER_PARTNER_SETTLEMENT_ID = await ensurePendingSettlement(staff, opts.otherPartnerOrganizationId, "AED");
  log(`  settlements ${env.E2E_PARTNER_SETTLEMENT_ID} (partner), ${env.E2E_OTHER_PARTNER_SETTLEMENT_ID} (other partner)`);

  const placementsUserId = await ensureAccount(INSTITUTION_PLACEMENTS, opts.keptPasswords, env);
  const placementsRoleId = await ensureCustomRole(opts.institution.id, "institution", "e2e_placements", "E2E Placements only (test)", ["institution.dashboard", "institution.placements.manage"]);
  await ensureMemberWithRole(opts.institution.id, placementsUserId, placementsRoleId);

  env.E2E_INSTITUTION_QA_BATCH_ID = await ensureQaBatch(opts.institution, opts.institutionOwnerUserId, opts.institutionCourseId, log);
  env.E2E_OTHER_INSTITUTION_COURSE_ID = opts.otherInstitutionCourseId;
  log(`  QA batch ${env.E2E_INSTITUTION_QA_BATCH_ID}`);
  return env;
}
