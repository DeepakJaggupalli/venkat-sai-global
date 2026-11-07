import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { InstitutionPermission, PlatformPermission } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import { batches, batchInstructors, courses, enrolments } from "@/db/schema";
import { staffCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";
import { forbiddenError, notFoundError } from "@/modules/organizations/errors";

export type CourseRow = typeof courses.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type EnrolmentRow = typeof enrolments.$inferSelect;

/**
 * Who manages training records: Venkat Sai staff (training.* permissions; organisation null = Venkat Sai
 * courses, and oversight of every institution) or an institution member (portal context of an
 * organisation of type "institution", scoped to that organisation).
 */
export type TrainingActor = StaffContext | OrgContext;

export function isInstitutionActor(actor: TrainingActor): actor is OrgContext {
  return "orgType" in actor && "organization" in actor;
}

export function trainingActorUserId(actor: TrainingActor): string {
  return actor.user.id;
}

/** The institution an actor manages (null for staff). Throws for members of other organisation types. */
export function actorInstitutionId(actor: TrainingActor): string | null {
  if (!isInstitutionActor(actor)) return null;
  if (actor.orgType !== "institution") throw forbiddenError();
  return actor.organization.id;
}

export type AccessRule = {
  /** Required institution permission. */
  member: InstitutionPermission;
  /** Required staff permission(s) (any of). */
  staff: PlatformPermission | readonly PlatformPermission[];
};

/** Check that the actor may act on a record owned by `organizationId` (null = Venkat Sai). */
export function assertTrainingAccess(actor: TrainingActor, organizationId: string | null, rule: AccessRule): void {
  if (isInstitutionActor(actor)) {
    if (actor.orgType !== "institution" || organizationId === null || actor.organization.id !== organizationId) throw forbiddenError();
    if (!actor.permissions.has(rule.member)) throw forbiddenError();
    return;
  }
  if (!staffCan(actor, typeof rule.staff === "string" ? rule.staff : [...rule.staff], "any")) throw forbiddenError();
}

export async function loadCourseForActor(actor: TrainingActor, courseId: string, rule: AccessRule, opts: { tx?: DbOrTx; lock?: boolean } = {}): Promise<CourseRow> {
  const t = opts.tx ?? db;
  const query = t
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);
  const [course] = opts.lock ? await query.for("update") : await query;
  if (!course) throw notFoundError("Course not found.");
  assertTrainingAccess(actor, course.organizationId, rule);
  return course;
}

/**
 * Load a batch (and its course) for an actor. With `instructorScoped`, institution members without
 * institution.batches.manage (e.g. instructors) may act only on batches they are assigned to.
 */
export async function loadBatchForActor(
  actor: TrainingActor,
  batchId: string,
  rule: AccessRule & { instructorScoped?: boolean },
  opts: { tx?: DbOrTx; lock?: boolean } = {},
): Promise<{ batch: BatchRow; course: CourseRow }> {
  const t = opts.tx ?? db;
  const query = t
    .select({ batch: batches, course: courses })
    .from(batches)
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(eq(batches.id, batchId))
    .limit(1);
  const [row] = opts.lock ? await query.for("update", { of: batches }) : await query;
  if (!row) throw notFoundError("Batch not found.");
  assertTrainingAccess(actor, row.batch.organizationId, rule);
  if (rule.instructorScoped && isInstitutionActor(actor) && !actor.permissions.has("institution.batches.manage")) {
    const [assigned] = await t
      .select({ id: batchInstructors.id })
      .from(batchInstructors)
      .where(and(eq(batchInstructors.batchId, batchId), eq(batchInstructors.userId, actor.user.id)))
      .limit(1);
    if (!assigned) throw forbiddenError("You can only manage batches you are assigned to as an instructor.");
  }
  return row;
}

/** Load an enrolment with its batch and course for an actor (same rules as the batch). */
export async function loadEnrolmentForActor(
  actor: TrainingActor,
  enrolmentId: string,
  rule: AccessRule & { instructorScoped?: boolean },
  opts: { tx?: DbOrTx; lock?: boolean } = {},
): Promise<{ enrolment: EnrolmentRow; batch: BatchRow; course: CourseRow }> {
  const t = opts.tx ?? db;
  const query = t.select().from(enrolments).where(eq(enrolments.id, enrolmentId)).limit(1);
  const [enrolment] = opts.lock ? await query.for("update") : await query;
  if (!enrolment) throw notFoundError("Enrolment not found.");
  const { batch, course } = await loadBatchForActor(actor, enrolment.batchId, rule, { tx: t });
  return { enrolment, batch, course };
}

export function assertStaffPermission(staff: StaffContext, permission: PlatformPermission | PlatformPermission[], mode: "all" | "any" = "all"): void {
  if (!staffCan(staff, permission, mode)) throw forbiddenError();
}
