import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { batches, candidateProfiles, courses, enrolments, organizations } from "@/db/schema";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { notify, notifyOrganization, notifyStaff } from "@/modules/notifications";
import { conflictError, forbiddenError, invalidStateError, notFoundError, withConstraintMessages } from "@/modules/organizations/errors";
import { hasValidVerification } from "@/modules/organizations/rules";

import { assertStaffPermission, loadBatchForActor, loadEnrolmentForActor, trainingActorUserId, type BatchRow, type CourseRow, type EnrolmentRow, type TrainingActor } from "./access";
import { candidateIdentities, type CandidateActor } from "./candidate";
import { ENROLMENT_STATUS_LABELS } from "./constants";
import { ACTIVE_ENROLMENT_STATUSES, batchApplicationCheck, canTransitionEnrolment, initialEnrolmentStatus, seatDelta, toIsoDate } from "./rules";

const STUDENTS = { member: "institution.students.manage", staff: "training.manage", instructorScoped: true } as const;
const FEES = { member: "institution.batches.manage", staff: "training.manage" } as const;

const ENROLMENT_CONSTRAINTS = { enrolments_batch_candidate_uq: "You have already applied to this batch." };

// ---------------------------------------------------------------------------
// Seats (capacity enforcement)
// ---------------------------------------------------------------------------

/**
 * Atomically take a seat. A single UPDATE re-checks `enrolled_count < capacity` on the latest row version
 * (PostgreSQL re-evaluates the WHERE clause after a concurrent update commits), so concurrent
 * confirmations can never exceed the capacity. An open batch that reaches capacity becomes "full".
 */
export async function takeSeat(tx: DbOrTx, batchId: string): Promise<boolean> {
  const rows = await tx
    .update(batches)
    .set({
      enrolledCount: sql`${batches.enrolledCount} + 1`,
      status: sql`case when ${batches.status} = 'open' and ${batches.capacity} is not null and ${batches.enrolledCount} + 1 >= ${batches.capacity} then 'full' else ${batches.status} end`,
    })
    .where(
      and(
        eq(batches.id, batchId),
        inArray(batches.status, ["planned", "open", "full", "in_progress"]),
        sql`(${batches.capacity} is null or ${batches.enrolledCount} < ${batches.capacity})`,
      ),
    )
    .returning({ id: batches.id });
  return rows.length > 0;
}

/** Release a seat; a full batch re-opens. */
export async function releaseSeat(tx: DbOrTx, batchId: string): Promise<void> {
  await tx
    .update(batches)
    .set({
      enrolledCount: sql`greatest(${batches.enrolledCount} - 1, 0)`,
      status: sql`case when ${batches.status} = 'full' then 'open' else ${batches.status} end`,
    })
    .where(eq(batches.id, batchId));
}

function feeSnapshot(course: CourseRow): Pick<typeof enrolments.$inferInsert, "feeStatus" | "feeMinor" | "feeCurrency"> {
  if (course.feeType === "fixed" && course.feeMinor !== null && course.feeCurrency) return { feeStatus: "pending", feeMinor: course.feeMinor, feeCurrency: course.feeCurrency };
  if (course.feeType === "on_request") return { feeStatus: "pending", feeMinor: null, feeCurrency: null };
  return { feeStatus: "not_applicable", feeMinor: null, feeCurrency: null };
}

function initialResultStatus(course: CourseRow): "pending" | "not_applicable" {
  return course.certificationType === "completion_only" || course.certificationType === "none" ? "not_applicable" : "pending";
}

function trainingManagersLink(batch: BatchRow): string {
  return batch.organizationId ? `/institution/students?batch=${batch.id}` : `/admin/training/batches/${batch.id}`;
}

async function notifyCandidate(tx: DbOrTx, enrolment: Pick<EnrolmentRow, "id" | "candidateId">, batch: BatchRow, course: CourseRow, status: EnrolmentRow["status"], reason: string | null): Promise<void> {
  const who = (await candidateIdentities([enrolment.candidateId], tx)).get(enrolment.candidateId);
  if (!who) return;
  const confirmed = status === "confirmed";
  await notify(
    {
      event: confirmed ? "training.enrolment_confirmed" : "training.enrolment_updated",
      recipients: [{ userId: who.userId }],
      data: {
        courseTitle: course.title,
        batchTitle: batch.title,
        batchCode: batch.code,
        startsOn: batch.startsOn,
        venue: batch.venue,
        mode: batch.mode,
        status,
        statusLabel: ENROLMENT_STATUS_LABELS[status],
        reason,
      },
      link: "/talent/training",
    },
    { tx },
  );
}

// ---------------------------------------------------------------------------
// Candidate side
// ---------------------------------------------------------------------------

async function loadBatchAndCourse(tx: DbOrTx, batchId: string): Promise<{ batch: BatchRow; course: CourseRow }> {
  const [row] = await tx
    .select({ batch: batches, course: courses })
    .from(batches)
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!row) throw notFoundError("Batch not found.");
  return row;
}

/**
 * A candidate applies to an open batch of a published course. Applying shares the candidate's name and
 * contact details with the organisation running the batch (shown on the form). A batch that is already
 * full puts the application straight on the waitlist. Re-applying after a rejection / cancellation /
 * drop reactivates the same enrolment row.
 */
export async function applyToBatch(candidate: CandidateActor, batchId: string, now: Date = new Date()): Promise<EnrolmentRow> {
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const { batch, course } = await loadBatchAndCourse(tx, batchId);
        if (course.deletedAt || course.status !== "published") throw invalidStateError("This course is not open for enrolment.");
        const open = batchApplicationCheck(batch, toIsoDate(now));
        if (!open.ok) throw invalidStateError(open.message);
        if (course.organizationId) {
          const [org] = await tx.select().from(organizations).where(eq(organizations.id, course.organizationId)).limit(1);
          if (!org || org.deletedAt || !hasValidVerification(org, now)) throw invalidStateError("This training provider is not accepting enrolments at the moment.");
        }
        const [profile] = await tx
          .select({ id: candidateProfiles.id })
          .from(candidateProfiles)
          .where(and(eq(candidateProfiles.id, candidate.candidateId), isNull(candidateProfiles.deletedAt)))
          .limit(1);
        if (!profile) throw notFoundError("Your profile could not be found.");

        const status = initialEnrolmentStatus(batch);
        const values = {
          status,
          source: "self" as const,
          enrolledByUserId: candidate.userId,
          appliedAt: now,
          confirmedAt: null,
          completedAt: null,
          cancelledAt: null,
          statusReason: null,
          ...feeSnapshot(course),
          paymentReference: null,
          attendancePercent: null,
          finalScore: null,
          resultStatus: initialResultStatus(course),
        };
        const [existing] = await tx
          .select()
          .from(enrolments)
          .where(and(eq(enrolments.batchId, batch.id), eq(enrolments.candidateId, candidate.candidateId)))
          .limit(1)
          .for("update");
        let enrolment: EnrolmentRow;
        if (existing) {
          if (ACTIVE_ENROLMENT_STATUSES.includes(existing.status)) throw conflictError("You have already applied to this batch.");
          if (!canTransitionEnrolment(existing.status, status)) throw invalidStateError("You cannot apply to this batch again.");
          [enrolment] = (await tx.update(enrolments).set(values).where(eq(enrolments.id, existing.id)).returning()) as [EnrolmentRow];
        } else {
          [enrolment] = (await tx.insert(enrolments).values({ batchId: batch.id, candidateId: candidate.candidateId, ...values }).returning()) as [EnrolmentRow];
        }

        const data = { courseTitle: course.title, batchTitle: batch.title, batchCode: batch.code, candidateName: candidate.displayName, status };
        if (batch.organizationId) {
          await notifyOrganization(
            { event: "training.enrolment_received", organizationId: batch.organizationId, permission: "institution.students.manage", data, link: trainingManagersLink(batch) },
            { tx },
          );
        } else {
          await notifyStaff({ event: "training.enrolment_received", permission: "training.manage", data, link: trainingManagersLink(batch) }, { tx });
        }
        await audit({
          action: existing ? "enrolment.reapplied" : "enrolment.applied",
          entityType: "enrolment",
          entityId: enrolment.id,
          organizationId: batch.organizationId,
          actorUserId: candidate.userId,
          actorType: "user",
          metadata: { batchId: batch.id, status },
          tx,
        });
        return enrolment;
      }),
    ENROLMENT_CONSTRAINTS,
  );
}

/** The candidate withdraws (applied / waitlisted / confirmed → cancelled; in progress → dropped). */
export async function withdrawEnrolment(candidate: CandidateActor, enrolmentId: string, reason?: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const [enrolment] = await tx
      .select()
      .from(enrolments)
      .where(and(eq(enrolments.id, enrolmentId), eq(enrolments.candidateId, candidate.candidateId)))
      .limit(1)
      .for("update");
    if (!enrolment) throw notFoundError("Enrolment not found.");
    const to = enrolment.status === "in_progress" ? "dropped" : "cancelled";
    if (!canTransitionEnrolment(enrolment.status, to)) throw invalidStateError("This enrolment can no longer be withdrawn.");
    if (seatDelta(enrolment.status, to) === -1) await releaseSeat(tx, enrolment.batchId);
    await tx
      .update(enrolments)
      .set({ status: to, cancelledAt: to === "cancelled" ? new Date() : enrolment.cancelledAt, statusReason: reason?.trim() || "Withdrawn by the learner." })
      .where(eq(enrolments.id, enrolment.id));
    await audit({ action: "enrolment.withdrawn", entityType: "enrolment", entityId: enrolment.id, actorUserId: candidate.userId, actorType: "user", metadata: { from: enrolment.status, to }, tx });
  });
}

// ---------------------------------------------------------------------------
// Institution / staff side
// ---------------------------------------------------------------------------

type ChangeOptions = { reason?: string | null; now?: Date; result?: { resultStatus?: EnrolmentRow["resultStatus"]; finalScore?: number | null } };

async function changeEnrolmentStatus(actor: TrainingActor, enrolmentId: string, to: EnrolmentRow["status"], opts: ChangeOptions = {}): Promise<EnrolmentRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const { enrolment, batch, course } = await loadEnrolmentForActor(actor, enrolmentId, STUDENTS, { tx, lock: true });
    if (enrolment.status === to) return enrolment;
    if (!canTransitionEnrolment(enrolment.status, to)) {
      throw invalidStateError(`An enrolment that is "${ENROLMENT_STATUS_LABELS[enrolment.status]}" cannot become "${ENROLMENT_STATUS_LABELS[to]}".`);
    }
    const delta = seatDelta(enrolment.status, to);
    if (delta === 1) {
      if (batch.status === "cancelled" || batch.status === "completed") throw invalidStateError("This batch is closed.");
      if (!(await takeSeat(tx, batch.id))) throw invalidStateError("This batch is full. Increase the capacity or put the learner on the waitlist.");
    } else if (delta === -1) {
      await releaseSeat(tx, batch.id);
    }
    const now = opts.now ?? new Date();
    const reason = opts.reason?.trim() || null;
    const [updated] = await tx
      .update(enrolments)
      .set({
        status: to,
        statusReason: ["rejected", "cancelled", "dropped", "waitlisted"].includes(to) ? reason : null,
        confirmedAt: to === "confirmed" ? now : enrolment.confirmedAt,
        cancelledAt: to === "cancelled" ? now : enrolment.cancelledAt,
        completedAt: to === "completed" ? now : enrolment.completedAt,
        ...(opts.result?.resultStatus ? { resultStatus: opts.result.resultStatus } : {}),
        ...(opts.result && opts.result.finalScore !== undefined ? { finalScore: opts.result.finalScore } : {}),
      })
      .where(eq(enrolments.id, enrolment.id))
      .returning();
    if (to !== "in_progress" && to !== "completed") await notifyCandidate(tx, enrolment, batch, course, to, reason);
    await audit({
      action: `enrolment.${to}`,
      entityType: "enrolment",
      entityId: enrolment.id,
      organizationId: batch.organizationId,
      actorUserId: userId,
      metadata: { from: enrolment.status, reason },
      tx,
    });
    return updated!;
  });
}

/** Confirm an application or waitlisted learner (takes a seat atomically; refuses when full). Notifies training.enrolment_confirmed. */
export function confirmEnrolment(actor: TrainingActor, enrolmentId: string): Promise<EnrolmentRow> {
  return changeEnrolmentStatus(actor, enrolmentId, "confirmed");
}
export function waitlistEnrolment(actor: TrainingActor, enrolmentId: string, note?: string | null): Promise<EnrolmentRow> {
  return changeEnrolmentStatus(actor, enrolmentId, "waitlisted", { reason: note });
}
export function rejectEnrolment(actor: TrainingActor, enrolmentId: string, reason: string): Promise<EnrolmentRow> {
  return changeEnrolmentStatus(actor, enrolmentId, "rejected", { reason });
}
/** Cancel (frees the seat). The reason is shown to the learner. */
export function cancelEnrolment(actor: TrainingActor, enrolmentId: string, reason: string): Promise<EnrolmentRow> {
  return changeEnrolmentStatus(actor, enrolmentId, "cancelled", { reason });
}
export function markEnrolmentDropped(actor: TrainingActor, enrolmentId: string, reason: string): Promise<EnrolmentRow> {
  return changeEnrolmentStatus(actor, enrolmentId, "dropped", { reason });
}
export function markEnrolmentInProgress(actor: TrainingActor, enrolmentId: string): Promise<EnrolmentRow> {
  return changeEnrolmentStatus(actor, enrolmentId, "in_progress");
}
/** Mark the learner as having completed the course, optionally recording the result. */
export function completeEnrolment(actor: TrainingActor, enrolmentId: string, result?: ChangeOptions["result"]): Promise<EnrolmentRow> {
  return changeEnrolmentStatus(actor, enrolmentId, "completed", { result });
}

/** Record the fee status of an enrolment (offline payments, waivers, refunds). */
export async function updateEnrolmentFee(actor: TrainingActor, enrolmentId: string, input: { feeStatus: EnrolmentRow["feeStatus"]; paymentReference?: string | null }): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const { enrolment, batch } = await loadEnrolmentForActor(actor, enrolmentId, FEES, { tx, lock: true });
    if (input.feeStatus === "not_applicable" && enrolment.feeMinor !== null) throw invalidStateError("This enrolment has a fee; mark it waived instead.");
    await tx
      .update(enrolments)
      .set({ feeStatus: input.feeStatus, paymentReference: input.paymentReference?.trim() || enrolment.paymentReference })
      .where(eq(enrolments.id, enrolment.id));
    await audit({
      action: "enrolment.fee_updated",
      entityType: "enrolment",
      entityId: enrolment.id,
      organizationId: batch.organizationId,
      actorUserId: userId,
      metadata: { from: enrolment.feeStatus, to: input.feeStatus },
      tx,
    });
  });
}

/**
 * Staff (training.manage) register a candidate directly into a Venkat Sai batch (walk-ins, employer
 * training requirements): the enrolment is confirmed at once (seat checked) and the candidate notified.
 */
export async function enrolCandidateByStaff(staff: StaffContext, batchId: string, candidateId: string, now: Date = new Date()): Promise<EnrolmentRow> {
  assertStaffPermission(staff, "training.manage");
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const { batch, course } = await loadBatchForActor(staff, batchId, { member: "institution.students.manage", staff: "training.manage" }, { tx });
        if (batch.organizationId !== null) throw forbiddenError("Candidates join institution batches by applying; the institution confirms them.");
        if (course.deletedAt || course.status === "archived") throw invalidStateError("This course is archived.");
        if (batch.status === "completed" || batch.status === "cancelled") throw invalidStateError("This batch is closed.");
        const [profile] = await tx.select({ id: candidateProfiles.id }).from(candidateProfiles).where(and(eq(candidateProfiles.id, candidateId), isNull(candidateProfiles.deletedAt))).limit(1);
        if (!profile) throw notFoundError("Candidate not found.");
        const [existing] = await tx.select().from(enrolments).where(and(eq(enrolments.batchId, batch.id), eq(enrolments.candidateId, candidateId))).limit(1).for("update");
        if (existing && ACTIVE_ENROLMENT_STATUSES.includes(existing.status)) throw conflictError("This candidate is already enrolled in the batch.");
        if (!(await takeSeat(tx, batch.id))) throw invalidStateError("This batch is full.");
        const status = batch.status === "in_progress" ? ("in_progress" as const) : ("confirmed" as const);
        const values = {
          status,
          source: "venkat_sai" as const,
          enrolledByUserId: staff.user.id,
          appliedAt: now,
          confirmedAt: now,
          completedAt: null,
          cancelledAt: null,
          statusReason: null,
          ...feeSnapshot(course),
          paymentReference: null,
          attendancePercent: null,
          finalScore: null,
          resultStatus: initialResultStatus(course),
        };
        const [enrolment] = existing
          ? await tx.update(enrolments).set(values).where(eq(enrolments.id, existing.id)).returning()
          : await tx.insert(enrolments).values({ batchId: batch.id, candidateId, ...values }).returning();
        await notifyCandidate(tx, enrolment!, batch, course, "confirmed", null);
        await audit({ action: "enrolment.staff_enrolled", entityType: "enrolment", entityId: enrolment!.id, actorUserId: staff.user.id, actorType: "staff", metadata: { batchId: batch.id, candidateId }, tx });
        return enrolment!;
      }),
    { enrolments_batch_candidate_uq: "This candidate is already enrolled in the batch." },
  );
}
