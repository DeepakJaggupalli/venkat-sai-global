import "server-only";

import { and, asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { assessmentCentres, countries, skillAssessments } from "@/db/schema";
import { audit } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { conflictError, forbiddenError, notFoundError, validationError, withConstraintMessages } from "@/modules/organizations/errors";

import { assertStaffPermission } from "./access";
import type { AssessmentCentreInput } from "./schemas";
import type { AssessmentCentreRow } from "./skill-assessments";

export type PublicAssessmentCentre = Pick<AssessmentCentreRow, "id" | "name" | "countryCode" | "stateRegion" | "city" | "capabilities">;

function centreValues(input: AssessmentCentreInput) {
  return {
    name: input.name,
    countryCode: input.countryCode,
    stateRegion: input.stateRegion ?? null,
    city: input.city,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    postalCode: input.postalCode ?? null,
    timezone: input.timezone ?? null,
    capabilities: input.capabilities,
    contactPhone: input.contactPhone ?? null,
    contactEmail: input.contactEmail ?? null,
    candidateInstructions: input.candidateInstructions ?? null,
  };
}

const CENTRE_CONSTRAINTS = { assessment_centres_name_uq: "An assessment centre with this name already exists." };

async function assertCountry(code: string): Promise<void> {
  const [row] = await db.select({ code: countries.code }).from(countries).where(eq(countries.code, code)).limit(1);
  if (!row) throw validationError("Choose a valid country.", { countryCode: ["Choose a valid country"] });
}

/** Staff (training.manage) record a real Venkat Sai testing facility. Capabilities describe equipment, not accreditation. */
export async function createAssessmentCentre(staff: StaffContext, input: AssessmentCentreInput): Promise<AssessmentCentreRow> {
  assertStaffPermission(staff, "training.manage");
  await assertCountry(input.countryCode);
  return withConstraintMessages(async () => {
    const [row] = await db.insert(assessmentCentres).values({ ...centreValues(input), isActive: true }).returning();
    await audit({ action: "assessment_centre.created", entityType: "assessment_centre", entityId: row!.id, actorUserId: staff.user.id, actorType: "staff", metadata: { name: row!.name } });
    return row!;
  }, CENTRE_CONSTRAINTS);
}

export async function updateAssessmentCentre(staff: StaffContext, centreId: string, input: AssessmentCentreInput): Promise<void> {
  assertStaffPermission(staff, "training.manage");
  await assertCountry(input.countryCode);
  await withConstraintMessages(async () => {
    const rows = await db.update(assessmentCentres).set(centreValues(input)).where(eq(assessmentCentres.id, centreId)).returning({ id: assessmentCentres.id });
    if (!rows.length) throw notFoundError("Assessment centre not found.");
    await audit({ action: "assessment_centre.updated", entityType: "assessment_centre", entityId: centreId, actorUserId: staff.user.id, actorType: "staff" });
  }, CENTRE_CONSTRAINTS);
}

/** Deactivate (hidden from scheduling, kept for history) or reactivate a centre. */
export async function setAssessmentCentreActive(staff: StaffContext, centreId: string, isActive: boolean): Promise<void> {
  assertStaffPermission(staff, "training.manage");
  const rows = await db.update(assessmentCentres).set({ isActive }).where(eq(assessmentCentres.id, centreId)).returning({ id: assessmentCentres.id });
  if (!rows.length) throw notFoundError("Assessment centre not found.");
  await audit({ action: isActive ? "assessment_centre.reactivated" : "assessment_centre.deactivated", entityType: "assessment_centre", entityId: centreId, actorUserId: staff.user.id, actorType: "staff" });
}

/** Delete a centre that no assessment references (otherwise deactivate it). */
export async function deleteAssessmentCentre(staff: StaffContext, centreId: string): Promise<void> {
  assertStaffPermission(staff, "training.manage");
  await db.transaction(async (tx) => {
    const [used] = await tx.select({ value: count() }).from(skillAssessments).where(eq(skillAssessments.assessmentCentreId, centreId));
    if ((used?.value ?? 0) > 0) throw conflictError("Assessments were held at this centre. Deactivate it instead.");
    const rows = await tx.delete(assessmentCentres).where(eq(assessmentCentres.id, centreId)).returning({ id: assessmentCentres.id });
    if (!rows.length) throw notFoundError("Assessment centre not found.");
    await audit({ action: "assessment_centre.deleted", entityType: "assessment_centre", entityId: centreId, actorUserId: staff.user.id, actorType: "staff", tx });
  });
}

/** All centres (staff with training.view, training.manage or recruitment.assessments). */
export async function listAssessmentCentres(staff: StaffContext, opts: { includeInactive?: boolean } = {}): Promise<AssessmentCentreRow[]> {
  if (!staffCan(staff, ["training.view", "training.manage", "recruitment.assessments"], "any")) throw forbiddenError();
  return db
    .select()
    .from(assessmentCentres)
    .where(opts.includeInactive ? undefined : eq(assessmentCentres.isActive, true))
    .orderBy(asc(assessmentCentres.countryCode), asc(assessmentCentres.city), asc(assessmentCentres.name));
}

/** Active centres for the public website (name, place and capabilities only). */
export async function listPublicAssessmentCentres(): Promise<PublicAssessmentCentre[]> {
  return db
    .select({
      id: assessmentCentres.id,
      name: assessmentCentres.name,
      countryCode: assessmentCentres.countryCode,
      stateRegion: assessmentCentres.stateRegion,
      city: assessmentCentres.city,
      capabilities: assessmentCentres.capabilities,
    })
    .from(assessmentCentres)
    .where(and(eq(assessmentCentres.isActive, true)))
    .orderBy(asc(assessmentCentres.city), asc(assessmentCentres.name));
}
