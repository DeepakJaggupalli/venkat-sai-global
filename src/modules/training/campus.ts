import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNull, ne, notInArray, or, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  batches,
  campusDriveRegistrations,
  campusDrives,
  candidateProfiles,
  countries,
  enrolments,
  jobs,
  organizationMembers,
  organizations,
  requirementRequests,
  users,
} from "@/db/schema";
import { nextCode } from "@/lib/codes";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import { recordConsent } from "@/modules/identity/consent";
import { staffCan } from "@/modules/identity/authz";
import { conflictError, forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "@/modules/organizations/errors";
import { hasValidVerification } from "@/modules/organizations/rules";

import { actorInstitutionId, assertTrainingAccess, isInstitutionActor, trainingActorUserId, type TrainingActor } from "./access";
import type { CandidateActor } from "./candidate";
import { toIsoDate } from "./rules";
import type { CampusDriveInput } from "./schemas";

export type CampusDriveRow = typeof campusDrives.$inferSelect;
export type CampusRegistrationRow = typeof campusDriveRegistrations.$inferSelect;
export type DriveRegistrationItem = CampusRegistrationRow & { candidateName: string; email: string | null; phone: string | null };
export type PublicCampusDrive = Pick<
  CampusDriveRow,
  "id" | "code" | "title" | "description" | "driveDate" | "driveEndDate" | "registrationDeadline" | "mode" | "venue" | "countryCode" | "city" | "eligibility" | "openings" | "status"
> & { organizerName: string; employerName: string | null; spotsLeft: number | null };

const PLACEMENTS = { member: "institution.placements.manage", staff: "training.manage" } as const;
const DRIVE_TRANSITIONS: Record<CampusDriveRow["status"], readonly CampusDriveRow["status"][]> = {
  planned: ["open", "cancelled"],
  open: ["planned", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

async function validateDrive(tx: DbOrTx, actor: TrainingActor, organizationId: string | null, input: CampusDriveInput): Promise<string | null> {
  if (input.countryCode) {
    const [row] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
    if (!row) throw validationError("Choose a valid country.", { countryCode: ["Choose a valid country"] });
  }
  let employerName = input.employerName ?? null;
  if (input.employerOrganizationId) {
    const [employer] = await tx.select().from(organizations).where(eq(organizations.id, input.employerOrganizationId)).limit(1);
    if (!employer || employer.deletedAt || employer.type !== "employer") throw validationError("Choose an employer on the platform.", { employerOrganizationId: ["Choose an employer"] });
    if (!hasValidVerification(employer, new Date())) throw validationError("Only verified employers can be linked to a drive.", { employerOrganizationId: ["The employer is not verified"] });
    employerName = employerName ?? employer.name;
  }
  if (input.jobIds.length) {
    const found = await tx
      .select({ id: jobs.id, organizationId: jobs.organizationId })
      .from(jobs)
      .where(and(inArray(jobs.id, input.jobIds), eq(jobs.status, "published"), isNull(jobs.deletedAt)));
    if (found.length !== input.jobIds.length) throw validationError("Choose published jobs.", { jobIds: ["Choose published jobs"] });
    if (input.employerOrganizationId && found.some((j) => j.organizationId !== null && j.organizationId !== input.employerOrganizationId)) {
      throw validationError("The jobs must belong to the participating employer.", { jobIds: ["Jobs of another employer"] });
    }
  }
  if (input.requirementId) {
    if (isInstitutionActor(actor)) throw forbiddenError("Only Venkat Sai can link a drive to a workforce requirement.");
    const [req] = await tx.select({ id: requirementRequests.id }).from(requirementRequests).where(eq(requirementRequests.id, input.requirementId)).limit(1);
    if (!req) throw validationError("Choose a valid requirement.", { requirementId: ["Choose a valid requirement"] });
  }
  if (input.coordinatorUserId) {
    const ok = organizationId
      ? await tx
          .select({ id: organizationMembers.id })
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, input.coordinatorUserId), eq(organizationMembers.status, "active")))
          .limit(1)
      : await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, input.coordinatorUserId), eq(users.isStaff, true), eq(users.status, "active")))
          .limit(1);
    if (!ok.length) throw validationError("Choose an active team member as coordinator.", { coordinatorUserId: ["Choose an active team member"] });
  }
  if (input.isPublic && organizationId) {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!org || !hasValidVerification(org, new Date())) throw validationError("Your institution must be verified before drives can be listed publicly.", { isPublic: ["Verification required"] });
  }
  return employerName;
}

function driveValues(input: CampusDriveInput, employerName: string | null) {
  return {
    title: input.title,
    description: input.description ?? null,
    employerOrganizationId: input.employerOrganizationId ?? null,
    employerName,
    driveDate: input.driveDate ?? null,
    driveEndDate: input.driveEndDate ?? null,
    registrationDeadline: input.registrationDeadline ?? null,
    mode: input.mode,
    venue: input.venue ?? null,
    countryCode: input.countryCode ?? null,
    city: input.city ?? null,
    eligibility: input.eligibility ?? null,
    jobIds: input.jobIds,
    openings: input.openings ?? null,
    capacity: input.capacity ?? null,
    isPublic: input.isPublic,
    coordinatorUserId: input.coordinatorUserId ?? null,
  };
}

/** Institutions (institution.placements.manage) or Venkat Sai (training.manage; organisation null) plan a hiring drive. */
export async function createCampusDrive(actor: TrainingActor, input: CampusDriveInput): Promise<CampusDriveRow> {
  const organizationId = actorInstitutionId(actor);
  assertTrainingAccess(actor, organizationId, PLACEMENTS);
  if (isInstitutionActor(actor) && actor.organization.status === "suspended") throw invalidStateError("A suspended institution cannot create drives.");
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const employerName = await validateDrive(tx, actor, organizationId, input);
    const code = await nextCode("DRV", { tx });
    const [drive] = await tx
      .insert(campusDrives)
      .values({ code, organizationId, requirementId: input.requirementId ?? null, ...driveValues(input, employerName), status: "planned", createdByUserId: userId })
      .returning();
    await audit({ action: "campus_drive.created", entityType: "campus_drive", entityId: drive!.id, organizationId, actorUserId: userId, metadata: { code }, tx });
    return drive!;
  });
}

async function loadDriveForActor(tx: DbOrTx, actor: TrainingActor, driveId: string, lock = false): Promise<CampusDriveRow> {
  const query = tx.select().from(campusDrives).where(eq(campusDrives.id, driveId)).limit(1);
  const [drive] = lock ? await query.for("update") : await query;
  if (!drive) throw notFoundError("Drive not found.");
  assertTrainingAccess(actor, drive.organizationId, PLACEMENTS);
  return drive;
}

export async function updateCampusDrive(actor: TrainingActor, driveId: string, input: CampusDriveInput): Promise<CampusDriveRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const drive = await loadDriveForActor(tx, actor, driveId, true);
    if (drive.status === "completed" || drive.status === "cancelled") throw invalidStateError("Completed or cancelled drives cannot be edited.");
    const employerName = await validateDrive(tx, actor, drive.organizationId, input);
    const [updated] = await tx
      .update(campusDrives)
      .set({ ...driveValues(input, employerName), ...(isInstitutionActor(actor) ? {} : { requirementId: input.requirementId ?? null }) })
      .where(eq(campusDrives.id, drive.id))
      .returning();
    await audit({ action: "campus_drive.updated", entityType: "campus_drive", entityId: drive.id, organizationId: drive.organizationId, actorUserId: userId, tx });
    return updated!;
  });
}

export async function setCampusDriveStatus(actor: TrainingActor, driveId: string, status: CampusDriveRow["status"], reason?: string | null): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const drive = await loadDriveForActor(tx, actor, driveId, true);
    if (drive.status === status) return;
    if (!DRIVE_TRANSITIONS[drive.status].includes(status)) throw invalidStateError(`A ${drive.status} drive cannot become ${status}.`);
    if (status === "cancelled" && !reason?.trim()) throw validationError("Give a reason for cancelling.", { reason: ["Required"] });
    await tx.update(campusDrives).set({ status, ...(status === "cancelled" ? { cancellationReason: reason!.trim() } : {}) }).where(eq(campusDrives.id, drive.id));
    await audit({ action: `campus_drive.${status}`, entityType: "campus_drive", entityId: drive.id, organizationId: drive.organizationId, actorUserId: userId, metadata: { from: drive.status, reason: reason ?? null }, tx });
  });
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

/**
 * A candidate registers for an open drive. Private (non-public) institution drives accept only learners
 * with an enrolment at that institution. Registering for a drive with a participating employer records
 * consent to share the profile with that employer (consent ledger + consentToShareAt).
 */
export async function registerForCampusDrive(candidate: CandidateActor, driveId: string, input: { consentToShare: boolean }, now: Date = new Date()): Promise<CampusRegistrationRow> {
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const [drive] = await tx.select().from(campusDrives).where(eq(campusDrives.id, driveId)).limit(1).for("update");
        if (!drive || drive.status !== "open") throw invalidStateError("This drive is not open for registration.");
        if (drive.registrationDeadline && drive.registrationDeadline < toIsoDate(now)) throw invalidStateError("Registration for this drive has closed.");
        if (drive.organizationId) {
          const [org] = await tx.select().from(organizations).where(eq(organizations.id, drive.organizationId)).limit(1);
          if (!org || org.deletedAt || !hasValidVerification(org, now)) throw invalidStateError("This drive is not accepting registrations.");
          if (!drive.isPublic) {
            const [learner] = await tx
              .select({ id: enrolments.id })
              .from(enrolments)
              .innerJoin(batches, eq(batches.id, enrolments.batchId))
              .where(and(eq(enrolments.candidateId, candidate.candidateId), eq(batches.organizationId, drive.organizationId), notInArray(enrolments.status, ["rejected", "cancelled"])))
              .limit(1);
            if (!learner) throw forbiddenError("This drive is open to the institution's own learners.");
          }
        }
        const hasEmployer = !!(drive.employerOrganizationId || drive.employerName);
        if (hasEmployer && !input.consentToShare) throw validationError("Confirm that your profile can be shared with the participating employer.", { consentToShare: ["Required to register"] });
        const [existing] = await tx
          .select()
          .from(campusDriveRegistrations)
          .where(and(eq(campusDriveRegistrations.driveId, drive.id), eq(campusDriveRegistrations.candidateId, candidate.candidateId)))
          .limit(1)
          .for("update");
        if (existing && existing.status !== "withdrawn") throw conflictError("You are already registered for this drive.");
        if (drive.capacity !== null) {
          const [taken] = await tx
            .select({ value: count() })
            .from(campusDriveRegistrations)
            .where(and(eq(campusDriveRegistrations.driveId, drive.id), ne(campusDriveRegistrations.status, "withdrawn")));
          if ((taken?.value ?? 0) >= drive.capacity) throw invalidStateError("This drive is full.");
        }
        const consentToShareAt = hasEmployer ? now : null;
        const [registration] = existing
          ? await tx.update(campusDriveRegistrations).set({ status: "registered", consentToShareAt, registeredByUserId: null }).where(eq(campusDriveRegistrations.id, existing.id)).returning()
          : await tx.insert(campusDriveRegistrations).values({ driveId: drive.id, candidateId: candidate.candidateId, status: "registered", consentToShareAt }).returning();
        if (hasEmployer) {
          await recordConsent(
            {
              userId: candidate.userId,
              purpose: "share_profile_with_employers",
              granted: true,
              source: "campus_drive",
              contextType: "campus_drive",
              contextId: drive.id,
              evidence: { employerOrganizationId: drive.employerOrganizationId, employerName: drive.employerName },
            },
            tx,
          );
        }
        await audit({ action: "campus_drive.registered", entityType: "campus_drive", entityId: drive.id, organizationId: drive.organizationId, actorUserId: candidate.userId, actorType: "user", tx });
        return registration!;
      }),
    { campus_drive_registrations_drive_candidate_uq: "You are already registered for this drive." },
  );
}

/** The candidate withdraws a registration (consent to share for this drive is withdrawn too). */
export async function withdrawCampusDriveRegistration(candidate: CandidateActor, registrationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [registration] = await tx
      .select()
      .from(campusDriveRegistrations)
      .where(and(eq(campusDriveRegistrations.id, registrationId), eq(campusDriveRegistrations.candidateId, candidate.candidateId)))
      .limit(1)
      .for("update");
    if (!registration) throw notFoundError("Registration not found.");
    if (registration.status === "withdrawn") return;
    if (registration.status === "selected") throw invalidStateError("You were selected at this drive. Contact the organiser to withdraw.");
    await tx.update(campusDriveRegistrations).set({ status: "withdrawn" }).where(eq(campusDriveRegistrations.id, registration.id));
    if (registration.consentToShareAt) {
      await recordConsent(
        { userId: candidate.userId, purpose: "share_profile_with_employers", granted: false, source: "campus_drive", contextType: "campus_drive", contextId: registration.driveId },
        tx,
      );
    }
    await audit({ action: "campus_drive.registration_withdrawn", entityType: "campus_drive", entityId: registration.driveId, actorUserId: candidate.userId, actorType: "user", tx });
  });
}

/** Organisers record shortlisting, attendance and selection. */
export async function updateCampusRegistrationStatus(actor: TrainingActor, registrationId: string, status: Exclude<CampusRegistrationRow["status"], "withdrawn">): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const [registration] = await tx.select().from(campusDriveRegistrations).where(eq(campusDriveRegistrations.id, registrationId)).limit(1).for("update");
    if (!registration) throw notFoundError("Registration not found.");
    const drive = await loadDriveForActor(tx, actor, registration.driveId);
    if (registration.status === "withdrawn") throw invalidStateError("The candidate withdrew this registration.");
    if (drive.status === "cancelled") throw invalidStateError("This drive was cancelled.");
    await tx.update(campusDriveRegistrations).set({ status }).where(eq(campusDriveRegistrations.id, registration.id));
    await audit({
      action: "campus_drive.registration_updated",
      entityType: "campus_drive",
      entityId: drive.id,
      organizationId: drive.organizationId,
      actorUserId: userId,
      metadata: { registrationId, from: registration.status, to: status },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCampusDrives(actor: TrainingActor, filters: { status?: CampusDriveRow["status"] }, page: PageQuery): Promise<Paginated<CampusDriveRow & { registrationCount: number }>> {
  const where: SQL[] = [];
  if (isInstitutionActor(actor)) {
    assertTrainingAccess(actor, actor.organization.id, { member: "institution.placements.manage", staff: "training.view" });
    where.push(eq(campusDrives.organizationId, actor.organization.id));
  } else if (!staffCan(actor, ["training.view", "training.manage"], "any")) {
    throw forbiddenError();
  }
  if (filters.status) where.push(eq(campusDrives.status, filters.status));
  const condition = where.length ? and(...where) : undefined;
  const registrations = db
    .select({ driveId: campusDriveRegistrations.driveId, value: count().as("value") })
    .from(campusDriveRegistrations)
    .where(ne(campusDriveRegistrations.status, "withdrawn"))
    .groupBy(campusDriveRegistrations.driveId)
    .as("reg");
  const [rows, total] = await Promise.all([
    db
      .select({ drive: campusDrives, registrationCount: registrations.value })
      .from(campusDrives)
      .leftJoin(registrations, eq(registrations.driveId, campusDrives.id))
      .where(condition)
      .orderBy(desc(campusDrives.driveDate), desc(campusDrives.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(campusDrives).where(condition),
  ]);
  return paginated(rows.map((r) => ({ ...r.drive, registrationCount: Number(r.registrationCount ?? 0) })), total[0]?.value ?? 0, page);
}

/** Registrants of a drive with contact details (organisers only; registering shares them with the organiser). */
export async function listDriveRegistrations(actor: TrainingActor, driveId: string): Promise<DriveRegistrationItem[]> {
  const drive = await loadDriveForActor(db, actor, driveId);
  const rows = await db
    .select({ r: campusDriveRegistrations, candidateName: users.displayName, email: users.email, phone: users.phone })
    .from(campusDriveRegistrations)
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, campusDriveRegistrations.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(eq(campusDriveRegistrations.driveId, drive.id))
    .orderBy(asc(users.displayName));
  return rows.map((r) => ({ ...r.r, candidateName: r.candidateName, email: r.email, phone: r.phone }));
}

/** Public events page: open or planned public drives of verified organisers, upcoming first. */
export async function listPublicCampusDrives(page: PageQuery, now: Date = new Date()): Promise<Paginated<PublicCampusDrive>> {
  const today = toIsoDate(now);
  const condition = and(
    eq(campusDrives.isPublic, true),
    inArray(campusDrives.status, ["planned", "open"]),
    or(isNull(campusDrives.driveDate), gte(campusDrives.driveDate, today)),
    or(isNull(campusDrives.organizationId), and(eq(organizations.status, "verified"), isNull(organizations.deletedAt))),
  );
  const registrations = db
    .select({ driveId: campusDriveRegistrations.driveId, value: count().as("value") })
    .from(campusDriveRegistrations)
    .where(ne(campusDriveRegistrations.status, "withdrawn"))
    .groupBy(campusDriveRegistrations.driveId)
    .as("reg");
  const [rows, total] = await Promise.all([
    db
      .select({ drive: campusDrives, organizerName: organizations.name, registered: registrations.value })
      .from(campusDrives)
      .leftJoin(organizations, eq(organizations.id, campusDrives.organizationId))
      .leftJoin(registrations, eq(registrations.driveId, campusDrives.id))
      .where(condition)
      .orderBy(asc(campusDrives.driveDate))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(campusDrives).leftJoin(organizations, eq(organizations.id, campusDrives.organizationId)).where(condition),
  ]);
  return paginated(
    rows.map(({ drive, organizerName, registered }) => ({
      id: drive.id,
      code: drive.code,
      title: drive.title,
      description: drive.description,
      driveDate: drive.driveDate,
      driveEndDate: drive.driveEndDate,
      registrationDeadline: drive.registrationDeadline,
      mode: drive.mode,
      venue: drive.venue,
      countryCode: drive.countryCode,
      city: drive.city,
      eligibility: drive.eligibility,
      openings: drive.openings,
      status: drive.status,
      organizerName: organizerName ?? "Venkat Sai",
      employerName: drive.employerName,
      spotsLeft: drive.capacity === null ? null : Math.max(0, drive.capacity - Number(registered ?? 0)),
    })),
    total[0]?.value ?? 0,
    page,
  );
}

export async function listCandidateCampusRegistrations(candidate: CandidateActor): Promise<(CampusRegistrationRow & { drive: CampusDriveRow })[]> {
  const rows = await db
    .select({ r: campusDriveRegistrations, drive: campusDrives })
    .from(campusDriveRegistrations)
    .innerJoin(campusDrives, eq(campusDrives.id, campusDriveRegistrations.driveId))
    .where(eq(campusDriveRegistrations.candidateId, candidate.candidateId))
    .orderBy(desc(campusDrives.driveDate));
  return rows.map((r) => ({ ...r.r, drive: r.drive }));
}
