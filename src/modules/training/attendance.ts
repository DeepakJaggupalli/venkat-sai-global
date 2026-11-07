import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { attendanceRecords, attendanceSessions, courseModules, enrolments } from "@/db/schema";
import { audit } from "@/modules/audit";
import { invalidStateError, notFoundError, validationError, withConstraintMessages } from "@/modules/organizations/errors";

import { loadBatchForActor, trainingActorUserId, type TrainingActor } from "./access";
import { computeAttendancePercent } from "./rules";
import type { AttendanceRecordInput, AttendanceSessionInput } from "./schemas";

export type AttendanceSessionRow = typeof attendanceSessions.$inferSelect;
export type AttendanceRecordRow = typeof attendanceRecords.$inferSelect;

/** Attendance is taken by members with institution.students.manage — instructors only for their batches. */
const ATTENDANCE = { member: "institution.students.manage", staff: "training.manage", instructorScoped: true } as const;
/** Enrolments attendance can be recorded for. */
const ATTENDING_STATUSES = ["confirmed", "in_progress", "completed"] as const;

async function assertModuleOfCourse(tx: DbOrTx, moduleId: string | undefined, courseId: string): Promise<void> {
  if (!moduleId) return;
  const [row] = await tx.select({ id: courseModules.id }).from(courseModules).where(and(eq(courseModules.id, moduleId), eq(courseModules.courseId, courseId))).limit(1);
  if (!row) throw validationError("Choose a module of this course.", { courseModuleId: ["Choose a module of this course"] });
}

/** Recompute attendancePercent for enrolments from their records. */
export async function refreshAttendancePercent(tx: DbOrTx, enrolmentIds: readonly string[]): Promise<void> {
  const ids = [...new Set(enrolmentIds)];
  if (!ids.length) return;
  const rows = await tx
    .select({ enrolmentId: attendanceRecords.enrolmentId, status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(inArray(attendanceRecords.enrolmentId, ids));
  const byEnrolment = new Map<string, AttendanceRecordRow["status"][]>();
  for (const r of rows) byEnrolment.set(r.enrolmentId, [...(byEnrolment.get(r.enrolmentId) ?? []), r.status]);
  for (const id of ids) {
    await tx.update(enrolments).set({ attendancePercent: computeAttendancePercent(byEnrolment.get(id) ?? []) }).where(eq(enrolments.id, id));
  }
}

export async function createAttendanceSession(actor: TrainingActor, batchId: string, input: AttendanceSessionInput): Promise<AttendanceSessionRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const { batch } = await loadBatchForActor(actor, batchId, ATTENDANCE, { tx });
    if (batch.status === "cancelled") throw invalidStateError("This batch was cancelled.");
    await assertModuleOfCourse(tx, input.courseModuleId, batch.courseId);
    const [row] = await tx
      .insert(attendanceSessions)
      .values({ batchId: batch.id, sessionDate: input.sessionDate, topic: input.topic ?? null, courseModuleId: input.courseModuleId ?? null, durationHours: input.durationHours ?? null, recordedByUserId: userId })
      .returning();
    await audit({ action: "attendance.session_created", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { sessionId: row!.id, sessionDate: input.sessionDate }, tx });
    return row!;
  });
}

async function loadSession(tx: DbOrTx, actor: TrainingActor, sessionId: string) {
  const [session] = await tx.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).limit(1).for("update");
  if (!session) throw notFoundError("Session not found.");
  const { batch } = await loadBatchForActor(actor, session.batchId, ATTENDANCE, { tx });
  return { session, batch };
}

export async function updateAttendanceSession(actor: TrainingActor, sessionId: string, input: AttendanceSessionInput): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const { session, batch } = await loadSession(tx, actor, sessionId);
    await assertModuleOfCourse(tx, input.courseModuleId, batch.courseId);
    await tx
      .update(attendanceSessions)
      .set({ sessionDate: input.sessionDate, topic: input.topic ?? null, courseModuleId: input.courseModuleId ?? null, durationHours: input.durationHours ?? null })
      .where(eq(attendanceSessions.id, session.id));
    await audit({ action: "attendance.session_updated", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { sessionId }, tx });
  });
}

/** Delete a session and its records; attendance percentages are recomputed. */
export async function deleteAttendanceSession(actor: TrainingActor, sessionId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const { session, batch } = await loadSession(tx, actor, sessionId);
    const affected = await tx.select({ enrolmentId: attendanceRecords.enrolmentId }).from(attendanceRecords).where(eq(attendanceRecords.sessionId, session.id));
    await tx.delete(attendanceSessions).where(eq(attendanceSessions.id, session.id));
    await refreshAttendancePercent(tx, affected.map((a) => a.enrolmentId));
    await audit({ action: "attendance.session_deleted", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { sessionId }, tx });
  });
}

/**
 * Record (or correct) attendance for a session. Every enrolment must belong to the session's batch and be
 * confirmed / in progress / completed. Corrections update the row (history in the audit log).
 */
export async function recordAttendance(actor: TrainingActor, sessionId: string, records: readonly AttendanceRecordInput[]): Promise<{ saved: number }> {
  const userId = trainingActorUserId(actor);
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const { session, batch } = await loadSession(tx, actor, sessionId);
        const ids = [...new Set(records.map((r) => r.enrolmentId))];
        if (ids.length !== records.length) throw validationError("Each learner can be marked once per session.");
        const valid = await tx
          .select({ id: enrolments.id })
          .from(enrolments)
          .where(and(inArray(enrolments.id, ids), eq(enrolments.batchId, batch.id), inArray(enrolments.status, [...ATTENDING_STATUSES])));
        if (valid.length !== ids.length) throw validationError("Some learners are not confirmed members of this batch. Refresh the page and try again.");
        for (const r of records) {
          await tx
            .insert(attendanceRecords)
            .values({ sessionId: session.id, enrolmentId: r.enrolmentId, status: r.status, remarks: r.remarks ?? null, recordedByUserId: userId })
            .onConflictDoUpdate({
              target: [attendanceRecords.sessionId, attendanceRecords.enrolmentId],
              set: { status: r.status, remarks: r.remarks ?? null, recordedByUserId: userId },
            });
        }
        await refreshAttendancePercent(tx, ids);
        await audit({
          action: "attendance.recorded",
          entityType: "batch",
          entityId: batch.id,
          organizationId: batch.organizationId,
          actorUserId: userId,
          metadata: { sessionId, count: records.length },
          tx,
        });
        return { saved: records.length };
      }),
    {},
  );
}

/** Sessions of a batch with their records (for the attendance register). */
export async function getAttendanceRegister(actor: TrainingActor, batchId: string): Promise<{ sessions: AttendanceSessionRow[]; records: AttendanceRecordRow[] }> {
  const { batch } = await loadBatchForActor(actor, batchId, { ...ATTENDANCE, staff: ["training.view", "training.manage"] });
  const sessions = await db.select().from(attendanceSessions).where(eq(attendanceSessions.batchId, batch.id)).orderBy(asc(attendanceSessions.sessionDate), asc(attendanceSessions.createdAt));
  const records = sessions.length ? await db.select().from(attendanceRecords).where(inArray(attendanceRecords.sessionId, sessions.map((s) => s.id))) : [];
  return { sessions, records };
}
