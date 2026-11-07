import "server-only";

import { and, count, desc, eq, isNull, or, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { countries, internshipProgrammes, jobs, organizations } from "@/db/schema";
import { toMinorUnits } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import { staffCan } from "@/modules/identity/authz";
import { forbiddenError, invalidStateError, notFoundError, validationError } from "@/modules/organizations/errors";
import { omit } from "@/modules/organizations/objects";
import { hasValidVerification } from "@/modules/organizations/rules";

import { actorInstitutionId, assertTrainingAccess, isInstitutionActor, trainingActorUserId, type TrainingActor } from "./access";
import { assertCurrency } from "./courses";
import type { InternshipInput } from "./schemas";

export type InternshipRow = typeof internshipProgrammes.$inferSelect;
export type PublicInternship = Omit<InternshipRow, "createdByUserId" | "organizationId" | "hostEmployerOrganizationId"> & { organizerName: string };

const PLACEMENTS = { member: "institution.placements.manage", staff: "training.manage" } as const;
const TRANSITIONS: Record<InternshipRow["status"], readonly InternshipRow["status"][]> = {
  draft: ["open", "cancelled"],
  open: ["draft", "closed", "cancelled"],
  closed: ["open", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

async function validateInternship(tx: DbOrTx, input: InternshipInput): Promise<void> {
  if (input.countryCode) {
    const [row] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
    if (!row) throw validationError("Choose a valid country.", { countryCode: ["Choose a valid country"] });
  }
  if (input.stipendType === "fixed") await assertCurrency(tx, input.stipendCurrency, "stipendCurrency");
  if (input.hostEmployerOrganizationId) {
    const [host] = await tx.select({ type: organizations.type, deletedAt: organizations.deletedAt }).from(organizations).where(eq(organizations.id, input.hostEmployerOrganizationId)).limit(1);
    if (!host || host.deletedAt || host.type !== "employer") throw validationError("Choose an employer on the platform.", { hostEmployerOrganizationId: ["Choose an employer"] });
  }
  if (input.jobId) {
    const [job] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, input.jobId), isNull(jobs.deletedAt))).limit(1);
    if (!job) throw validationError("Choose a valid job posting.", { jobId: ["Choose a valid job"] });
  }
}

function internshipValues(input: InternshipInput) {
  const fixed = input.stipendType === "fixed" && input.stipendAmount !== undefined && input.stipendCurrency;
  return {
    title: input.title,
    description: input.description ?? null,
    eligibility: input.eligibility ?? null,
    durationWeeks: input.durationWeeks ?? null,
    startsOn: input.startsOn ?? null,
    applicationDeadline: input.applicationDeadline ?? null,
    workMode: input.workMode ?? null,
    countryCode: input.countryCode ?? null,
    city: input.city ?? null,
    stipendType: input.stipendType,
    stipendMinor: fixed ? toMinorUnits(input.stipendAmount!, input.stipendCurrency!) : null,
    stipendCurrency: fixed ? input.stipendCurrency! : null,
    stipendPeriod: fixed ? (input.stipendPeriod ?? null) : null,
    seats: input.seats ?? null,
    hostEmployerOrganizationId: input.hostEmployerOrganizationId ?? null,
    hostEmployerName: input.hostEmployerName ?? null,
    jobId: input.jobId ?? null,
  };
}

/** Institutions (institution.placements.manage) or Venkat Sai (training.manage) create an internship programme (draft). */
export async function createInternship(actor: TrainingActor, input: InternshipInput): Promise<InternshipRow> {
  const organizationId = actorInstitutionId(actor);
  assertTrainingAccess(actor, organizationId, PLACEMENTS);
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    await validateInternship(tx, input);
    const [row] = await tx.insert(internshipProgrammes).values({ organizationId, ...internshipValues(input), status: "draft", createdByUserId: userId }).returning();
    await audit({ action: "internship.created", entityType: "internship_programme", entityId: row!.id, organizationId, actorUserId: userId, tx });
    return row!;
  });
}

async function loadInternship(tx: DbOrTx, actor: TrainingActor, id: string): Promise<InternshipRow> {
  const [row] = await tx.select().from(internshipProgrammes).where(eq(internshipProgrammes.id, id)).limit(1).for("update");
  if (!row) throw notFoundError("Internship programme not found.");
  assertTrainingAccess(actor, row.organizationId, PLACEMENTS);
  return row;
}

export async function updateInternship(actor: TrainingActor, internshipId: string, input: InternshipInput): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const row = await loadInternship(tx, actor, internshipId);
    if (row.status === "completed" || row.status === "cancelled") throw invalidStateError("This programme has ended.");
    await validateInternship(tx, input);
    await tx.update(internshipProgrammes).set(internshipValues(input)).where(eq(internshipProgrammes.id, row.id));
    await audit({ action: "internship.updated", entityType: "internship_programme", entityId: row.id, organizationId: row.organizationId, actorUserId: userId, tx });
  });
}

/** Open / close / complete / cancel. Opening an institution programme needs a verified institution. */
export async function setInternshipStatus(actor: TrainingActor, internshipId: string, status: InternshipRow["status"]): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const row = await loadInternship(tx, actor, internshipId);
    if (row.status === status) return;
    if (!TRANSITIONS[row.status].includes(status)) throw invalidStateError(`A ${row.status} programme cannot become ${status}.`);
    if (status === "open" && row.organizationId) {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, row.organizationId)).limit(1);
      if (!org || !hasValidVerification(org, new Date())) throw invalidStateError("Your institution must be verified before programmes can be opened.");
    }
    await tx.update(internshipProgrammes).set({ status }).where(eq(internshipProgrammes.id, row.id));
    await audit({ action: `internship.${status}`, entityType: "internship_programme", entityId: row.id, organizationId: row.organizationId, actorUserId: userId, metadata: { from: row.status }, tx });
  });
}

export async function listInternships(actor: TrainingActor, filters: { status?: InternshipRow["status"] }, page: PageQuery): Promise<Paginated<InternshipRow>> {
  const where: SQL[] = [];
  if (isInstitutionActor(actor)) {
    assertTrainingAccess(actor, actor.organization.id, { member: "institution.placements.manage", staff: "training.view" });
    where.push(eq(internshipProgrammes.organizationId, actor.organization.id));
  } else if (!staffCan(actor, ["training.view", "training.manage"], "any")) {
    throw forbiddenError();
  }
  if (filters.status) where.push(eq(internshipProgrammes.status, filters.status));
  const condition = where.length ? and(...where) : undefined;
  const [rows, total] = await Promise.all([
    db.select().from(internshipProgrammes).where(condition).orderBy(desc(internshipProgrammes.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(internshipProgrammes).where(condition),
  ]);
  return paginated(rows, total[0]?.value ?? 0, page);
}

/** Open programmes of verified organisers (and Venkat Sai) for the public site. */
export async function listPublicInternships(page: PageQuery): Promise<Paginated<PublicInternship>> {
  const condition = and(
    eq(internshipProgrammes.status, "open"),
    or(isNull(internshipProgrammes.organizationId), and(eq(organizations.status, "verified"), isNull(organizations.deletedAt))),
  );
  const [rows, total] = await Promise.all([
    db
      .select({ p: internshipProgrammes, organizerName: organizations.name })
      .from(internshipProgrammes)
      .leftJoin(organizations, eq(organizations.id, internshipProgrammes.organizationId))
      .where(condition)
      .orderBy(desc(internshipProgrammes.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(internshipProgrammes).leftJoin(organizations, eq(organizations.id, internshipProgrammes.organizationId)).where(condition),
  ]);
  return paginated(
    rows.map(({ p, organizerName }) => ({ ...omit(p, ["createdByUserId", "organizationId", "hostEmployerOrganizationId"]), organizerName: organizerName ?? "Venkat Sai" })),
    total[0]?.value ?? 0,
    page,
  );
}
