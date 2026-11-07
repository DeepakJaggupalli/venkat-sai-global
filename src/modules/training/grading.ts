import "server-only";

import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { assessmentScores, courseAssessments, enrolments } from "@/db/schema";
import { audit } from "@/modules/audit";
import { conflictError, invalidStateError, notFoundError, validationError } from "@/modules/organizations/errors";

import { loadBatchForActor, loadEnrolmentForActor, trainingActorUserId, type TrainingActor } from "./access";
import { computeFinalResult, SEAT_HOLDING_STATUSES } from "./rules";
import type { AssessmentScoreInput, CourseAssessmentInput } from "./schemas";

export type CourseAssessmentRow = typeof courseAssessments.$inferSelect;
export type AssessmentScoreRow = typeof assessmentScores.$inferSelect;

/** Members with institution.assessments.manage (instructors: assigned batches only); staff training.manage. */
const GRADING = { member: "institution.assessments.manage", staff: "training.manage", instructorScoped: true } as const;

function assessmentValues(input: CourseAssessmentInput) {
  return {
    title: input.title,
    type: input.type,
    maxScore: input.maxScore,
    passScore: input.passScore ?? null,
    weightPercent: input.weightPercent ?? null,
    scheduledAt: input.scheduledAt ?? null,
  };
}

export async function createCourseAssessment(actor: TrainingActor, batchId: string, input: CourseAssessmentInput): Promise<CourseAssessmentRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const { batch } = await loadBatchForActor(actor, batchId, GRADING, { tx });
    if (batch.status === "cancelled") throw invalidStateError("This batch was cancelled.");
    const [row] = await tx.insert(courseAssessments).values({ batchId: batch.id, ...assessmentValues(input), createdByUserId: userId }).returning();
    await audit({ action: "course_assessment.created", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { assessmentId: row!.id }, tx });
    return row!;
  });
}

async function loadAssessment(tx: DbOrTx, actor: TrainingActor, assessmentId: string) {
  const [assessment] = await tx.select().from(courseAssessments).where(eq(courseAssessments.id, assessmentId)).limit(1).for("update");
  if (!assessment) throw notFoundError("Assessment not found.");
  const { batch, course } = await loadBatchForActor(actor, assessment.batchId, GRADING, { tx });
  return { assessment, batch, course };
}

/** Edit an assessment. The maximum cannot drop below a score already recorded. */
export async function updateCourseAssessment(actor: TrainingActor, assessmentId: string, input: CourseAssessmentInput): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const { assessment, batch } = await loadAssessment(tx, actor, assessmentId);
    const [top] = await tx.select({ value: sql<number | null>`max(${assessmentScores.score})` }).from(assessmentScores).where(eq(assessmentScores.assessmentId, assessment.id));
    if (top?.value !== null && top?.value !== undefined && Number(top.value) > input.maxScore) {
      throw validationError(`A learner already scored ${top.value}. The maximum cannot be lower.`, { maxScore: [`At least ${top.value}`] });
    }
    await tx.update(courseAssessments).set(assessmentValues(input)).where(eq(courseAssessments.id, assessment.id));
    await tx.execute(sql`update assessment_scores set passed = case when ${input.passScore ?? null}::numeric is null then null when is_absent then false else score >= ${input.passScore ?? null}::numeric end where assessment_id = ${assessment.id} and (score is not null or is_absent)`);
    await audit({ action: "course_assessment.updated", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { assessmentId }, tx });
  });
}

/** Delete an assessment whose results have not been published. */
export async function deleteCourseAssessment(actor: TrainingActor, assessmentId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const { assessment, batch } = await loadAssessment(tx, actor, assessmentId);
    if (assessment.resultsPublishedAt) throw conflictError("Results of this assessment were published. It cannot be deleted.");
    await tx.delete(courseAssessments).where(eq(courseAssessments.id, assessment.id));
    await audit({ action: "course_assessment.deleted", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { assessmentId, title: assessment.title }, tx });
  });
}

/**
 * Record scores (or absences) for learners of the batch. Scores cannot exceed the maximum; `passed` is
 * derived from the pass mark. Learners see scores and remarks only after the results are published.
 */
export async function recordAssessmentScores(actor: TrainingActor, assessmentId: string, scores: readonly AssessmentScoreInput[]): Promise<{ saved: number }> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const { assessment, batch } = await loadAssessment(tx, actor, assessmentId);
    const ids = [...new Set(scores.map((s) => s.enrolmentId))];
    if (ids.length !== scores.length) throw validationError("Each learner can have one score per assessment.");
    const valid = await tx
      .select({ id: enrolments.id })
      .from(enrolments)
      .where(and(inArray(enrolments.id, ids), eq(enrolments.batchId, batch.id), inArray(enrolments.status, [...SEAT_HOLDING_STATUSES])));
    if (valid.length !== ids.length) throw validationError("Some learners are not confirmed members of this batch. Refresh the page and try again.");
    for (const s of scores) {
      const score = s.isAbsent ? null : (s.score ?? null);
      if (score !== null && score > assessment.maxScore) throw validationError(`A score cannot exceed ${assessment.maxScore}.`, { scores: [`Maximum ${assessment.maxScore}`] });
      const passed = assessment.passScore === null ? null : s.isAbsent ? false : score === null ? null : score >= assessment.passScore;
      await tx
        .insert(assessmentScores)
        .values({ assessmentId: assessment.id, enrolmentId: s.enrolmentId, score, isAbsent: s.isAbsent, passed, remarks: s.remarks ?? null, recordedByUserId: userId })
        .onConflictDoUpdate({
          target: [assessmentScores.assessmentId, assessmentScores.enrolmentId],
          set: { score, isAbsent: s.isAbsent, passed, remarks: s.remarks ?? null, recordedByUserId: userId },
        });
    }
    await audit({ action: "course_assessment.scores_recorded", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { assessmentId, count: scores.length }, tx });
    return { saved: scores.length };
  });
}

/** Make the scores and remarks of an assessment visible to its learners. */
export async function publishAssessmentResults(actor: TrainingActor, assessmentId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const { assessment, batch } = await loadAssessment(tx, actor, assessmentId);
    if (assessment.resultsPublishedAt) return;
    const [marked] = await tx.select({ value: count() }).from(assessmentScores).where(and(eq(assessmentScores.assessmentId, assessment.id), sql`(${assessmentScores.score} is not null or ${assessmentScores.isAbsent})`));
    if ((marked?.value ?? 0) === 0) throw invalidStateError("Record at least one score before publishing results.");
    await tx.update(courseAssessments).set({ resultsPublishedAt: new Date() }).where(eq(courseAssessments.id, assessment.id));
    await audit({ action: "course_assessment.results_published", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { assessmentId }, tx });
  });
}

/**
 * Compute final scores and results for every confirmed / in-progress / completed learner of a batch
 * (rules.computeFinalResult). Learners with a missing mark keep a pending result.
 */
export async function computeBatchResults(actor: TrainingActor, batchId: string): Promise<{ updated: number; incomplete: number }> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const { batch, course } = await loadBatchForActor(actor, batchId, GRADING, { tx });
    const assessments = await tx.select().from(courseAssessments).where(eq(courseAssessments.batchId, batch.id)).orderBy(asc(courseAssessments.createdAt));
    const learners = await tx.select().from(enrolments).where(and(eq(enrolments.batchId, batch.id), inArray(enrolments.status, [...SEAT_HOLDING_STATUSES])));
    const scores = assessments.length && learners.length
      ? await tx.select().from(assessmentScores).where(inArray(assessmentScores.assessmentId, assessments.map((a) => a.id)))
      : [];
    let updated = 0;
    let incomplete = 0;
    for (const learner of learners) {
      const result = computeFinalResult(
        assessments.map((a) => ({ id: a.id, maxScore: a.maxScore, passScore: a.passScore, weightPercent: a.weightPercent })),
        scores.filter((s) => s.enrolmentId === learner.id).map((s) => ({ assessmentId: s.assessmentId, score: s.score, isAbsent: s.isAbsent })),
        course.certificationType,
      );
      if (!result.complete) incomplete += 1;
      await tx.update(enrolments).set({ finalScore: result.finalScore, resultStatus: result.resultStatus }).where(eq(enrolments.id, learner.id));
      updated += 1;
    }
    await audit({ action: "course_assessment.results_computed", entityType: "batch", entityId: batch.id, organizationId: batch.organizationId, actorUserId: userId, metadata: { updated, incomplete }, tx });
    return { updated, incomplete };
  });
}

/** Set a learner's result by hand (e.g. courses without pass marks). */
export async function setEnrolmentResult(actor: TrainingActor, enrolmentId: string, input: { resultStatus: (typeof enrolments.$inferSelect)["resultStatus"]; finalScore?: number | null }): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const { enrolment, batch } = await loadEnrolmentForActor(actor, enrolmentId, GRADING, { tx, lock: true });
    if (!SEAT_HOLDING_STATUSES.includes(enrolment.status)) throw invalidStateError("Results are recorded for confirmed learners only.");
    await tx
      .update(enrolments)
      .set({ resultStatus: input.resultStatus, ...(input.finalScore !== undefined ? { finalScore: input.finalScore } : {}) })
      .where(eq(enrolments.id, enrolment.id));
    await audit({
      action: "enrolment.result_set",
      entityType: "enrolment",
      entityId: enrolment.id,
      organizationId: batch.organizationId,
      actorUserId: userId,
      metadata: { from: enrolment.resultStatus, to: input.resultStatus, finalScore: input.finalScore ?? null },
      tx,
    });
  });
}

/** Assessments of a batch with all recorded scores (staff / institution view). */
export async function getBatchGradebook(actor: TrainingActor, batchId: string): Promise<{ assessments: CourseAssessmentRow[]; scores: AssessmentScoreRow[] }> {
  const { batch } = await loadBatchForActor(actor, batchId, { ...GRADING, staff: ["training.view", "training.manage"] });
  const assessments = await db.select().from(courseAssessments).where(eq(courseAssessments.batchId, batch.id)).orderBy(asc(courseAssessments.scheduledAt), asc(courseAssessments.createdAt));
  const scores = assessments.length ? await db.select().from(assessmentScores).where(inArray(assessmentScores.assessmentId, assessments.map((a) => a.id))) : [];
  return { assessments, scores };
}

/** Published scores of one learner (People Portal). */
export async function listPublishedScoresForEnrolment(enrolmentId: string, tx: DbOrTx = db): Promise<{ assessment: CourseAssessmentRow; score: AssessmentScoreRow | null }[]> {
  const assessments = await tx
    .select()
    .from(courseAssessments)
    .innerJoin(enrolments, eq(enrolments.batchId, courseAssessments.batchId))
    .where(and(eq(enrolments.id, enrolmentId), isNotNull(courseAssessments.resultsPublishedAt)))
    .orderBy(asc(courseAssessments.scheduledAt));
  const ids = assessments.map((a) => a.course_assessments.id);
  const scores = ids.length ? await tx.select().from(assessmentScores).where(and(eq(assessmentScores.enrolmentId, enrolmentId), inArray(assessmentScores.assessmentId, ids))) : [];
  return assessments.map((a) => ({ assessment: a.course_assessments, score: scores.find((s) => s.assessmentId === a.course_assessments.id) ?? null }));
}
