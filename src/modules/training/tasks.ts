import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the training module.
 * Task type names must be prefixed with "training." (see src/server/tasks/schedule.ts for recurring ones).
 *
 * training.batch_reminders (daily):
 *  - open / full batches whose start date has arrived → in_progress (confirmed learners too)
 *  - confirmed learners of batches starting within 3 days → training.batch_starting
 *  - skill assessments and course assessments within the next 48 hours → assessment.reminder
 *  - active certificates past their printed expiry date → expired
 * Reminders are de-duplicated per learner and date (notification dedupe keys).
 */
export type BatchReminderSummary = { batchesStarted: number; batchReminders: number; assessmentReminders: number; certificatesExpired: number };

export async function runBatchReminders(now: Date = new Date()): Promise<BatchReminderSummary> {
  const { and, eq, gt, gte, inArray, isNull, lte } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const { batches, courseAssessments, courses, enrolments } = await import("@/db/schema");
  const { notify } = await import("@/modules/notifications");
  const { startDueBatches } = await import("./batches");
  const { candidateIdentities } = await import("./candidate");
  const { expireLapsedCertificates } = await import("./certificates");
  const { SKILL_ASSESSMENT_TYPE_LABELS } = await import("./constants");
  const { addDays, toIsoDate } = await import("./rules");
  const { listUpcomingSkillAssessments } = await import("./skill-assessments");

  const today = toIsoDate(now);
  const summary: BatchReminderSummary = { batchesStarted: 0, batchReminders: 0, assessmentReminders: 0, certificatesExpired: 0 };

  summary.batchesStarted = await startDueBatches(now);

  // Batches starting within the next 3 days.
  const starting = await db
    .select({ enrolment: enrolments, batch: batches, courseTitle: courses.title })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(and(eq(enrolments.status, "confirmed"), inArray(batches.status, ["planned", "open", "full"]), gt(batches.startsOn, today), lte(batches.startsOn, addDays(today, 3))));
  const startingIdentities = await candidateIdentities(starting.map((s) => s.enrolment.candidateId));
  for (const { enrolment, batch, courseTitle } of starting) {
    const who = startingIdentities.get(enrolment.candidateId);
    if (!who) continue;
    await notify({
      event: "training.batch_starting",
      recipients: [{ userId: who.userId }],
      data: { courseTitle, batchTitle: batch.title, batchCode: batch.code, startsOn: batch.startsOn, schedule: batch.schedule, venue: batch.venue, mode: batch.mode },
      link: "/talent/training",
      dedupeKey: `batch-starting:${batch.id}:${enrolment.id}:${batch.startsOn}`,
    });
    summary.batchReminders += 1;
  }

  // Assessments in the next 48 hours.
  const horizon = new Date(now.getTime() + 48 * 3_600_000);
  const skillTests = await listUpcomingSkillAssessments(now, horizon);
  const skillIdentities = await candidateIdentities(skillTests.map((a) => a.candidateId));
  for (const a of skillTests) {
    const who = skillIdentities.get(a.candidateId);
    if (!who) continue;
    await notify({
      event: "assessment.reminder",
      recipients: [{ userId: who.userId }],
      data: { kind: "skill_assessment", code: a.code, title: `${a.trade} — ${SKILL_ASSESSMENT_TYPE_LABELS[a.assessmentType]}`, scheduledAt: a.scheduledAt.toISOString(), location: a.location },
      link: "/talent/assessments",
      dedupeKey: `skill-assessment-reminder:${a.id}:${a.scheduledAt.toISOString()}`,
    });
    summary.assessmentReminders += 1;
  }

  const courseTests = await db
    .select({ assessment: courseAssessments, enrolment: enrolments, batch: batches })
    .from(courseAssessments)
    .innerJoin(batches, eq(batches.id, courseAssessments.batchId))
    .innerJoin(enrolments, eq(enrolments.batchId, batches.id))
    .where(
      and(
        gte(courseAssessments.scheduledAt, now),
        lte(courseAssessments.scheduledAt, horizon),
        isNull(courseAssessments.resultsPublishedAt),
        inArray(enrolments.status, ["confirmed", "in_progress"]),
        inArray(batches.status, ["open", "full", "in_progress"]),
      ),
    );
  const courseIdentities = await candidateIdentities(courseTests.map((c) => c.enrolment.candidateId));
  for (const { assessment, enrolment, batch } of courseTests) {
    const who = courseIdentities.get(enrolment.candidateId);
    if (!who || !assessment.scheduledAt) continue;
    await notify({
      event: "assessment.reminder",
      recipients: [{ userId: who.userId }],
      data: { kind: "course_assessment", title: assessment.title, batchTitle: batch.title, batchCode: batch.code, scheduledAt: assessment.scheduledAt.toISOString() },
      link: "/talent/training",
      dedupeKey: `course-assessment-reminder:${assessment.id}:${enrolment.id}:${assessment.scheduledAt.toISOString()}`,
    });
    summary.assessmentReminders += 1;
  }

  summary.certificatesExpired = await expireLapsedCertificates(now);
  return summary;
}

export const tasks: TaskHandlers = {
  "training.batch_reminders": async (_payload, ctx) => {
    const summary = await runBatchReminders(new Date());
    ctx.log("training.batch_reminders finished", summary);
  },
};
