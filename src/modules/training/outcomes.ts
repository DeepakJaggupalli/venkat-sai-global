import "server-only";

import { and, count, desc, eq, isNull, ne, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { batches, campusDriveRegistrations, campusDrives, candidateProfiles, countries, enrolments, organizations, placementOutcomes, users } from "@/db/schema";
import { toMinorUnits } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import { requireUploadedFile } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { forbiddenError, invalidStateError, notFoundError, validationError } from "@/modules/organizations/errors";
import { omit } from "@/modules/organizations/objects";

import { actorInstitutionId, assertStaffPermission, assertTrainingAccess, isInstitutionActor, trainingActorUserId, type TrainingActor } from "./access";
import type { CandidateActor } from "./candidate";
import { assertCurrency } from "./courses";
import type { PlacementOutcomeInput } from "./schemas";

export type PlacementOutcomeRow = typeof placementOutcomes.$inferSelect;
export type PlacementOutcomeItem = PlacementOutcomeRow & { candidateName: string };
/** What the learner sees about their own outcome (internal notes removed). */
export type CandidatePlacementOutcome = Omit<PlacementOutcomeRow, "notes"> & { reportedBy: string };

const PLACEMENTS = { member: "institution.placements.manage", staff: "training.manage" } as const;

type Resolved = { candidateId: string; enrolmentId: string | null; campusDriveId: string | null };

/**
 * Institutions may only report outcomes of their own learners: an enrolment in one of their batches or a
 * registration at one of their drives. Venkat Sai (organisation null) reports outcomes of its own training.
 */
async function resolveLearner(tx: DbOrTx, organizationId: string | null, input: PlacementOutcomeInput): Promise<Resolved> {
  let candidateId = input.candidateId ?? null;
  let enrolmentId: string | null = null;
  if (input.enrolmentId) {
    const [row] = await tx
      .select({ candidateId: enrolments.candidateId, batchOrg: batches.organizationId })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .where(eq(enrolments.id, input.enrolmentId))
      .limit(1);
    if (!row || row.batchOrg !== organizationId) throw validationError("Choose one of your learners' enrolments.", { enrolmentId: ["Not one of your enrolments"] });
    if (candidateId && candidateId !== row.candidateId) throw validationError("The learner does not match the enrolment.", { candidateId: ["Does not match the enrolment"] });
    candidateId = row.candidateId;
    enrolmentId = input.enrolmentId;
  }
  if (!candidateId) throw validationError("Choose the learner.", { enrolmentId: ["Choose the learner"] });
  const [profile] = await tx.select({ id: candidateProfiles.id }).from(candidateProfiles).where(and(eq(candidateProfiles.id, candidateId), isNull(candidateProfiles.deletedAt))).limit(1);
  if (!profile) throw notFoundError("Learner not found.");

  let campusDriveId: string | null = null;
  if (input.campusDriveId) {
    const [drive] = await tx
      .select({ organizationId: campusDrives.organizationId, registrationId: campusDriveRegistrations.id })
      .from(campusDrives)
      .leftJoin(campusDriveRegistrations, and(eq(campusDriveRegistrations.driveId, campusDrives.id), eq(campusDriveRegistrations.candidateId, candidateId)))
      .where(eq(campusDrives.id, input.campusDriveId))
      .limit(1);
    if (!drive || drive.organizationId !== organizationId || !drive.registrationId) throw validationError("Choose one of your drives the learner registered for.", { campusDriveId: ["Not one of your drives"] });
    campusDriveId = input.campusDriveId;
  }

  if (organizationId && !enrolmentId && !campusDriveId) {
    const [enrolled] = await tx
      .select({ id: enrolments.id })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .where(and(eq(enrolments.candidateId, candidateId), eq(batches.organizationId, organizationId)))
      .limit(1);
    const [registered] = enrolled
      ? [enrolled]
      : await tx
          .select({ id: campusDriveRegistrations.id })
          .from(campusDriveRegistrations)
          .innerJoin(campusDrives, eq(campusDrives.id, campusDriveRegistrations.driveId))
          .where(and(eq(campusDriveRegistrations.candidateId, candidateId), eq(campusDrives.organizationId, organizationId), ne(campusDriveRegistrations.status, "withdrawn")))
          .limit(1);
    if (!registered) throw forbiddenError("You can only report outcomes for your own learners.");
  }
  return { candidateId, enrolmentId, campusDriveId };
}

async function outcomeValues(tx: DbOrTx, organizationId: string | null, actorUserId: string, input: PlacementOutcomeInput) {
  if (input.countryCode) {
    const [row] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
    if (!row) throw validationError("Choose a valid country.", { countryCode: ["Choose a valid country"] });
  }
  if (input.salaryAmount !== undefined) await assertCurrency(tx, input.salaryCurrency, "salaryCurrency");
  if (input.employerOrganizationId) {
    const [employer] = await tx.select({ type: organizations.type }).from(organizations).where(eq(organizations.id, input.employerOrganizationId)).limit(1);
    if (!employer || employer.type !== "employer") throw validationError("Choose an employer on the platform.", { employerOrganizationId: ["Choose an employer"] });
  }
  const evidenceFileId = input.evidenceFileId
    ? (await requireUploadedFile(input.evidenceFileId, { purposes: ["org_document", "candidate_document"], ownerUserId: actorUserId, ...(organizationId ? { organizationId } : {}) }, tx)).id
    : null;
  const hasSalary = input.salaryAmount !== undefined && !!input.salaryCurrency;
  return {
    sourceType: input.sourceType,
    employerName: input.employerName,
    employerOrganizationId: input.employerOrganizationId ?? null,
    jobTitle: input.jobTitle,
    employmentType: input.employmentType ?? null,
    countryCode: input.countryCode ?? null,
    city: input.city ?? null,
    placedOn: input.placedOn,
    salaryMinor: hasSalary ? toMinorUnits(input.salaryAmount!, input.salaryCurrency!) : null,
    salaryCurrency: hasSalary ? input.salaryCurrency! : null,
    salaryPeriod: hasSalary ? (input.salaryPeriod ?? null) : null,
    evidenceFileId,
    notes: input.notes ?? null,
  };
}

/** Report a learner's employment outcome (self-reported until Venkat Sai verifies the evidence). */
export async function recordPlacementOutcome(actor: TrainingActor, input: PlacementOutcomeInput): Promise<PlacementOutcomeRow> {
  const organizationId = actorInstitutionId(actor);
  assertTrainingAccess(actor, organizationId, PLACEMENTS);
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const learner = await resolveLearner(tx, organizationId, input);
    const [row] = await tx
      .insert(placementOutcomes)
      .values({ organizationId, ...learner, ...(await outcomeValues(tx, organizationId, userId, input)), verified: false, recordedByUserId: userId })
      .returning();
    await audit({ action: "placement_outcome.recorded", entityType: "placement_outcome", entityId: row!.id, organizationId, actorUserId: userId, metadata: { candidateId: learner.candidateId }, tx });
    return row!;
  });
}

async function loadOutcome(tx: DbOrTx, actor: TrainingActor, outcomeId: string): Promise<PlacementOutcomeRow> {
  const [row] = await tx.select().from(placementOutcomes).where(eq(placementOutcomes.id, outcomeId)).limit(1).for("update");
  if (!row) throw notFoundError("Outcome not found.");
  assertTrainingAccess(actor, row.organizationId, PLACEMENTS);
  return row;
}

/** Edit an unverified outcome (verified outcomes are evidence and stay as verified). */
export async function updatePlacementOutcome(actor: TrainingActor, outcomeId: string, input: PlacementOutcomeInput): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const row = await loadOutcome(tx, actor, outcomeId);
    if (row.verified) throw invalidStateError("A verified outcome cannot be edited. Ask Venkat Sai to correct it.");
    const learner = await resolveLearner(tx, row.organizationId, input);
    await tx
      .update(placementOutcomes)
      .set({ ...learner, ...(await outcomeValues(tx, row.organizationId, userId, input)) })
      .where(eq(placementOutcomes.id, row.id));
    await audit({ action: "placement_outcome.updated", entityType: "placement_outcome", entityId: row.id, organizationId: row.organizationId, actorUserId: userId, tx });
  });
}

export async function deletePlacementOutcome(actor: TrainingActor, outcomeId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const row = await loadOutcome(tx, actor, outcomeId);
    if (row.verified) throw invalidStateError("A verified outcome cannot be deleted.");
    await tx.delete(placementOutcomes).where(eq(placementOutcomes.id, row.id));
    await audit({ action: "placement_outcome.deleted", entityType: "placement_outcome", entityId: row.id, organizationId: row.organizationId, actorUserId: userId, tx });
  });
}

/** Staff (training.manage) verify an outcome against its evidence (only verified outcomes may feed public figures). */
export async function verifyPlacementOutcome(staff: StaffContext, outcomeId: string, verified: boolean): Promise<void> {
  assertStaffPermission(staff, "training.manage");
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(placementOutcomes).where(eq(placementOutcomes.id, outcomeId)).limit(1).for("update");
    if (!row) throw notFoundError("Outcome not found.");
    if (verified && !row.evidenceFileId) throw invalidStateError("Attach the offer or appointment letter before verifying.");
    await tx
      .update(placementOutcomes)
      .set({ verified, verifiedAt: verified ? new Date() : null, verifiedByUserId: verified ? staff.user.id : null })
      .where(eq(placementOutcomes.id, row.id));
    await audit({ action: verified ? "placement_outcome.verified" : "placement_outcome.unverified", entityType: "placement_outcome", entityId: row.id, organizationId: row.organizationId, actorUserId: staff.user.id, actorType: "staff", tx });
  });
}

/** The learner confirms an outcome reported about them. */
export async function confirmPlacementOutcome(candidate: CandidateActor, outcomeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(placementOutcomes).where(and(eq(placementOutcomes.id, outcomeId), eq(placementOutcomes.candidateId, candidate.candidateId))).limit(1).for("update");
    if (!row) throw notFoundError("Outcome not found.");
    if (row.candidateConfirmedAt) return;
    await tx.update(placementOutcomes).set({ candidateConfirmedAt: new Date() }).where(eq(placementOutcomes.id, row.id));
    await audit({ action: "placement_outcome.confirmed_by_candidate", entityType: "placement_outcome", entityId: row.id, organizationId: row.organizationId, actorUserId: candidate.userId, actorType: "user", tx });
  });
}

export async function listPlacementOutcomes(actor: TrainingActor, filters: { verified?: boolean }, page: PageQuery): Promise<Paginated<PlacementOutcomeItem>> {
  const where: SQL[] = [];
  if (isInstitutionActor(actor)) {
    if (actor.orgType !== "institution" || !(actor.permissions.has("institution.placements.manage") || actor.permissions.has("institution.reports.view"))) throw forbiddenError();
    where.push(eq(placementOutcomes.organizationId, actor.organization.id));
  } else if (!staffCan(actor, ["training.view", "training.manage"], "any")) {
    throw forbiddenError();
  }
  if (filters.verified !== undefined) where.push(eq(placementOutcomes.verified, filters.verified));
  const condition = where.length ? and(...where) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({ o: placementOutcomes, candidateName: users.displayName })
      .from(placementOutcomes)
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, placementOutcomes.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(condition)
      .orderBy(desc(placementOutcomes.placedOn))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(placementOutcomes).where(condition),
  ]);
  return paginated(rows.map((r) => ({ ...r.o, candidateName: r.candidateName })), total[0]?.value ?? 0, page);
}

export async function listCandidatePlacementOutcomes(candidate: CandidateActor): Promise<CandidatePlacementOutcome[]> {
  const rows = await db
    .select({ o: placementOutcomes, orgName: organizations.name })
    .from(placementOutcomes)
    .leftJoin(organizations, eq(organizations.id, placementOutcomes.organizationId))
    .where(eq(placementOutcomes.candidateId, candidate.candidateId))
    .orderBy(desc(placementOutcomes.placedOn));
  return rows.map(({ o, orgName }) => ({ ...omit(o, ["notes"]), reportedBy: orgName ?? "Venkat Sai" }));
}
