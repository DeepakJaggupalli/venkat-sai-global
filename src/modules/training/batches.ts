import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { batches, batchInstructors, countries, enrolments, organizationMembers, requirementRequests, users } from "@/db/schema";
import { nextCode } from "@/lib/codes";
import { audit } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "@/modules/organizations/errors";

import { isInstitutionActor, loadBatchForActor, loadCourseForActor, trainingActorUserId, type BatchRow, type TrainingActor } from "./access";
import { candidateIdentities } from "./candidate";
import { canTransitionBatch, toIsoDate } from "./rules";
import type { BatchInput, BatchInstructorInput } from "./schemas";

export type BatchInstructorRow = typeof batchInstructors.$inferSelect;

const MANAGE = { member: "institution.batches.manage", staff: "training.manage" } as const;

async function validateBatchInput(tx: DbOrTx, actor: TrainingActor, input: BatchInput): Promise<void> {
  if (input.countryCode) {
    const [row] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
    if (!row) throw validationError("Choose a valid country.", { countryCode: ["Choose a valid country"] });
  }
  if (input.requirementId) {
    if (isInstitutionActor(actor)) throw forbiddenError("Only Venkat Sai can link a batch to a workforce requirement.");
    const [row] = await tx.select({ id: requirementRequests.id }).from(requirementRequests).where(eq(requirementRequests.id, input.requirementId)).limit(1);
    if (!row) throw validationError("Choose a valid requirement.", { requirementId: ["Choose a valid requirement"] });
  }
}

function batchValues(input: BatchInput) {
  return {
    title: input.title,
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
    schedule: input.schedule ?? null,
    timezone: input.timezone ?? null,
    mode: input.mode,
    venue: input.venue ?? null,
    countryCode: input.countryCode ?? null,
    city: input.city ?? null,
    capacity: input.capacity ?? null,
    registrationDeadline: input.registrationDeadline ?? null,
  };
}

/** Schedule a run of a course (institution.batches.manage for the course owner; staff training.manage). Starts "planned". */
export async function createBatch(actor: TrainingActor, courseId: string, input: BatchInput): Promise<BatchRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
    if (course.status === "archived") throw invalidStateError("Restore the course before scheduling batches.");
    await validateBatchInput(tx, actor, input);
    const code = await nextCode("BAT", { tx });
    const [batch] = await tx
      .insert(batches)
      .values({ code, courseId: course.id, organizationId: course.organizationId, requirementId: input.requirementId ?? null, ...batchValues(input), status: "planned", createdByUserId: userId })
      .returning();
    await audit({ action: "batch.created", entityType: "batch", entityId: batch!.id, organizationId: course.organizationId, actorUserId: userId, metadata: { code, courseId: course.id }, tx });
    return batch!;
  });
}

/** Edit a batch. Capacity cannot drop below the seats already taken; "full" / "open" follow the new capacity. */
export async function updateBatch(actor: TrainingActor, batchId: string, input: BatchInput): Promise<BatchRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const { batch } = await loadBatchForActor(actor, batchId, MANAGE, { tx, lock: true });
    if (batch.status === "completed" || batch.status === "cancelled") throw invalidStateError("Completed or cancelled batches cannot be edited.");
    await validateBatchInput(tx, actor, input);
    if (input.capacity !== undefined && input.capacity < batch.enrolledCount) {
      throw validationError(`${batch.enrolledCount} learners are already confirmed. Capacity cannot be lower.`, { capacity: [`At least ${batch.enrolledCount}`] });
    }
    const values = batchValues(input);
    let status = batch.status;
    if (batch.status === "open" || batch.status === "full") {
      status = values.capacity !== null && batch.enrolledCount >= values.capacity ? "full" : "open";
    }
    const [updated] = await tx
      .update(batches)
      .set({ ...values, status, ...(isInstitutionActor(actor) ? {} : { requirementId: input.requirementId ?? null }) })
      .where(eq(batches.id, batch.id))
      .returning();
    await audit({ action: "batch.updated", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, tx });
    return updated!;
  });
}

async function transition(actor: TrainingActor, batchId: string, to: BatchRow["status"], extra: (batch: BatchRow, tx: DbOrTx) => Promise<Partial<typeof batches.$inferInsert>>): Promise<BatchRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const { batch, course } = await loadBatchForActor(actor, batchId, MANAGE, { tx, lock: true });
    if (!canTransitionBatch(batch.status, to)) throw invalidStateError(`A ${batch.status.replace("_", " ")} batch cannot become ${to.replace("_", " ")}.`);
    if (to === "open" && course.status !== "published") throw invalidStateError("Publish the course before opening enrolment.");
    const values = await extra(batch, tx);
    const [updated] = await tx.update(batches).set({ status: to, ...values }).where(eq(batches.id, batch.id)).returning();
    await audit({ action: `batch.${to}`, entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { from: batch.status }, tx });
    return updated!;
  });
}

/** planned → open (the course must be published). A batch at capacity opens as "full". */
export async function openBatch(actor: TrainingActor, batchId: string): Promise<BatchRow> {
  const updated = await transition(actor, batchId, "open", async () => ({}));
  if (updated.capacity !== null && updated.enrolledCount >= updated.capacity) {
    const [full] = await db.update(batches).set({ status: "full" }).where(and(eq(batches.id, updated.id), eq(batches.status, "open"))).returning();
    return full ?? updated;
  }
  return updated;
}

/** Stop taking applications for now (open / full → planned). */
export async function pauseBatchEnrolment(actor: TrainingActor, batchId: string): Promise<BatchRow> {
  return transition(actor, batchId, "planned", async (batch) => {
    if (batch.status === "full") throw invalidStateError("A full batch already takes no new seats.");
    return {};
  });
}

/** The batch starts: confirmed learners become "in progress". */
export async function startBatch(actor: TrainingActor, batchId: string): Promise<BatchRow> {
  return transition(actor, batchId, "in_progress", async (batch, tx) => {
    await tx.update(enrolments).set({ status: "in_progress" }).where(and(eq(enrolments.batchId, batch.id), eq(enrolments.status, "confirmed")));
    return {};
  });
}

/** in_progress → completed. Learners are completed individually with their results (completeEnrolment). */
export async function completeBatch(actor: TrainingActor, batchId: string): Promise<BatchRow> {
  return transition(actor, batchId, "completed", async () => ({}));
}

/**
 * Cancel a batch: every applied / waitlisted / confirmed / in-progress enrolment is cancelled with the
 * reason (shown to learners), seats are released, and learners are notified.
 */
export async function cancelBatch(actor: TrainingActor, batchId: string, reason: string): Promise<BatchRow> {
  const now = new Date();
  return transition(actor, batchId, "cancelled", async (batch, tx) => {
    const rows = await tx
      .update(enrolments)
      .set({ status: "cancelled", cancelledAt: now, statusReason: reason })
      .where(and(eq(enrolments.batchId, batch.id), inArray(enrolments.status, ["applied", "waitlisted", "confirmed", "in_progress"])))
      .returning({ id: enrolments.id, candidateId: enrolments.candidateId });
    const identities = await candidateIdentities(rows.map((r) => r.candidateId), tx);
    for (const row of rows) {
      const who = identities.get(row.candidateId);
      if (!who) continue;
      await notify(
        {
          event: "training.enrolment_updated",
          recipients: [{ userId: who.userId }],
          data: { batchTitle: batch.title, batchCode: batch.code, status: "cancelled", reason },
          link: "/talent/training",
          dedupeKey: `batch-cancelled:${batch.id}:${row.id}`,
        },
        { tx },
      );
    }
    return { cancelledAt: now, cancellationReason: reason, enrolledCount: 0 };
  });
}

// ---------------------------------------------------------------------------
// Instructors
// ---------------------------------------------------------------------------

export async function listBatchInstructors(batchId: string, tx: DbOrTx = db): Promise<BatchInstructorRow[]> {
  return tx.select().from(batchInstructors).where(eq(batchInstructors.batchId, batchId)).orderBy(asc(batchInstructors.sortOrder), asc(batchInstructors.name));
}

/** Platform instructors must be active members of the institution (or staff for Venkat Sai batches). */
async function resolveInstructorUser(tx: DbOrTx, batch: BatchRow, userId: string): Promise<string> {
  if (batch.organizationId) {
    const [row] = await tx
      .select({ name: users.displayName })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(and(eq(organizationMembers.organizationId, batch.organizationId), eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
      .limit(1);
    if (!row) throw validationError("Choose an active member of your institution.", { userId: ["Choose an active team member"] });
    return row.name;
  }
  const [row] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isStaff, true), eq(users.status, "active")))
    .limit(1);
  if (!row) throw validationError("Choose an active Venkat Sai team member.", { userId: ["Choose an active team member"] });
  return row.name;
}

export async function addBatchInstructor(actor: TrainingActor, batchId: string, input: BatchInstructorInput): Promise<BatchInstructorRow> {
  const userId = trainingActorUserId(actor);
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const { batch } = await loadBatchForActor(actor, batchId, MANAGE, { tx, lock: true });
        const accountName = input.userId ? await resolveInstructorUser(tx, batch, input.userId) : null;
        const name = input.name ?? accountName!;
        const [row] = await tx
          .insert(batchInstructors)
          .values({ batchId: batch.id, userId: input.userId ?? null, name, bio: input.bio ?? null, role: input.role })
          .returning();
        await audit({ action: "batch.instructor_added", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { instructorUserId: input.userId ?? null }, tx });
        return row!;
      }),
    { batch_instructors_batch_user_uq: "This person is already an instructor of the batch." },
  );
}

export async function updateBatchInstructor(actor: TrainingActor, instructorId: string, input: BatchInstructorInput): Promise<void> {
  const userId = trainingActorUserId(actor);
  await withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const [instructor] = await tx.select().from(batchInstructors).where(eq(batchInstructors.id, instructorId)).limit(1).for("update");
        if (!instructor) throw notFoundError("Instructor not found.");
        const { batch } = await loadBatchForActor(actor, instructor.batchId, MANAGE, { tx });
        const accountName = input.userId ? await resolveInstructorUser(tx, batch, input.userId) : null;
        const name = input.name ?? accountName!;
        await tx.update(batchInstructors).set({ userId: input.userId ?? null, name, bio: input.bio ?? null, role: input.role }).where(eq(batchInstructors.id, instructor.id));
        await audit({ action: "batch.instructor_updated", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, tx });
      }),
    { batch_instructors_batch_user_uq: "This person is already an instructor of the batch." },
  );
}

export async function removeBatchInstructor(actor: TrainingActor, instructorId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const [instructor] = await tx.select().from(batchInstructors).where(eq(batchInstructors.id, instructorId)).limit(1).for("update");
    if (!instructor) throw notFoundError("Instructor not found.");
    const { batch } = await loadBatchForActor(actor, instructor.batchId, MANAGE, { tx });
    await tx.delete(batchInstructors).where(eq(batchInstructors.id, instructor.id));
    await audit({ action: "batch.instructor_removed", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, tx });
  });
}

/** Batches whose start date is today or earlier move to in_progress (used by the daily task). */
export async function startDueBatches(now: Date = new Date()): Promise<number> {
  const today = toIsoDate(now);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: batches.id, organizationId: batches.organizationId })
      .from(batches)
      .where(and(inArray(batches.status, ["open", "full"]), lte(batches.startsOn, today)))
      .for("update", { skipLocked: true });
    for (const row of due) {
      await tx.update(batches).set({ status: "in_progress" }).where(eq(batches.id, row.id));
      await tx.update(enrolments).set({ status: "in_progress" }).where(and(eq(enrolments.batchId, row.id), eq(enrolments.status, "confirmed")));
      await audit({ action: "batch.in_progress", entityType: "batch", entityId: row.id, organizationId: row.organizationId, actorType: "system", metadata: { automatic: true }, tx });
    }
    return due.length;
  });
}
