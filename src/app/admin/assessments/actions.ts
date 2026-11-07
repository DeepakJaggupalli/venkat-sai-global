"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";
import { SKILL_ASSESSMENT_TYPES } from "@/modules/training/constants";
import { rescheduleSkillAssessment, scheduleSkillAssessment } from "@/modules/training/skill-assessments";

import { localToIsoInstant, staffTimeZone } from "../pipeline/_shared/server";

/**
 * Command Centre assessment-centre actions that need form adaptation before calling the training
 * module: local date-time + venue time zone → ISO instant, and batch scheduling for many candidates.
 * Every action re-authorises (recruitment.assessments); the module re-checks every record.
 */

const ASSESSMENTS_PATH = "/admin/assessments";

const zoneField = z.string().trim().max(64).optional();

const batchScheduleSchema = z
  .object({
    candidateIds: f.uuidArray(),
    applicationIds: f.stringArray(),
    requirementId: f.optionalUuid(),
    assessmentCentreId: f.optionalUuid(),
    location: f.optionalText(300),
    trade: f.text({ max: 120, label: "Trade" }),
    assessmentType: f.enumOf(SKILL_ASSESSMENT_TYPES, "Choose the assessment type"),
    process: f.optionalText(120),
    position: f.optionalText(60),
    standardReference: f.optionalText(200),
    materialDetails: f.optionalText(500),
    evaluationMethods: f.stringArray(),
    scheduledAtLocal: f.dateTimeLocal(),
    timezone: zoneField,
    browserTimeZone: zoneField,
    assessorUserId: f.optionalUuid(),
    assessorName: f.optionalText(120),
    maxScore: z.preprocess((v) => (v === undefined || v === "" ? undefined : v), z.coerce.number().positive().max(100_000).optional()),
    retestOfAssessmentId: f.optionalUuid(),
  })
  .refine((v) => !v.retestOfAssessmentId || v.candidateIds.length === 1, { path: ["candidateIds"], message: "A retest is scheduled for one candidate" })
  .refine((v) => v.candidateIds.length > 0, { path: ["candidateIds"], message: "Choose at least one candidate" })
  .refine((v) => v.candidateIds.length <= 100, { path: ["candidateIds"], message: "Schedule at most 100 candidates at a time" })
  .refine((v) => !!v.assessmentCentreId || !!v.location, { path: ["assessmentCentreId"], message: "Choose an assessment centre or enter the venue" });

/**
 * Schedules the same assessment for one or many candidates (e.g. every shortlisted candidate of a
 * requirement). Each candidate is scheduled independently; failures are reported, successes kept.
 * Trade tests linked to a requirement are paid by the employer or Venkat Sai — never the candidate.
 */
export const scheduleAssessmentsAction = createFormAction(batchScheduleSchema, async (input) => {
  const staff = await requireStaff("recruitment.assessments");
  const scheduledAt = localToIsoInstant(input.scheduledAtLocal, input.timezone || input.browserTimeZone, staffTimeZone(staff));
  if (!scheduledAt) throw new ActionError("Enter a valid date and time.", { fieldErrors: { scheduledAtLocal: ["Enter a valid date and time"] } });
  // applicationIds[] are "candidateId:applicationId" pairs so a scheduled test stays linked to the application.
  const appByCandidate = new Map<string, string>();
  for (const pair of input.applicationIds) {
    const [candidateId, applicationId] = pair.split(":");
    if (candidateId && applicationId && z.uuid().safeParse(applicationId).success) appByCandidate.set(candidateId, applicationId);
  }
  const failures: string[] = [];
  let scheduled = 0;
  let lastId: string | null = null;
  for (const candidateId of input.candidateIds) {
    try {
      const row = await scheduleSkillAssessment(staff, {
        candidateId,
        applicationId: appByCandidate.get(candidateId),
        requirementId: input.requirementId,
        assessmentCentreId: input.assessmentCentreId,
        location: input.location,
        trade: input.trade,
        assessmentType: input.assessmentType,
        process: input.process,
        position: input.position,
        standardReference: input.standardReference,
        materialDetails: input.materialDetails,
        evaluationMethods: input.evaluationMethods.filter(Boolean).slice(0, 10),
        scheduledAt: new Date(scheduledAt),
        assessorUserId: input.assessorUserId,
        assessorName: input.assessorName,
        maxScore: input.maxScore,
        retestOfAssessmentId: input.retestOfAssessmentId,
      });
      scheduled += 1;
      lastId = row.id;
    } catch (err) {
      if (err instanceof ActionError) failures.push(err.message);
      else throw err;
    }
  }
  revalidatePath(ASSESSMENTS_PATH, "layout");
  if (!scheduled) throw new ActionError(failures[0] ?? "No assessment could be scheduled.");
  const message =
    failures.length > 0
      ? `${scheduled} assessment${scheduled === 1 ? "" : "s"} scheduled; ${failures.length} could not be scheduled (${failures[0]}).`
      : `${scheduled} assessment${scheduled === 1 ? "" : "s"} scheduled. Candidates have been notified.`;
  return ok({ id: input.candidateIds.length === 1 && lastId ? lastId : null, scheduled, failed: failures.length }, message);
});

const rescheduleSchema = z
  .object({
    assessmentId: f.uuid(),
    scheduledAtLocal: f.dateTimeLocal(),
    timezone: zoneField,
    browserTimeZone: zoneField,
    assessmentCentreId: f.optionalUuid(),
    location: f.optionalText(300),
  })
  .refine((v) => !!v.assessmentCentreId || !!v.location, { path: ["assessmentCentreId"], message: "Choose an assessment centre or enter the venue" });

export const rescheduleAssessmentAction = createFormAction(rescheduleSchema, async (input) => {
  const staff = await requireStaff("recruitment.assessments");
  const scheduledAt = localToIsoInstant(input.scheduledAtLocal, input.timezone || input.browserTimeZone, staffTimeZone(staff));
  if (!scheduledAt) throw new ActionError("Enter a valid date and time.", { fieldErrors: { scheduledAtLocal: ["Enter a valid date and time"] } });
  await rescheduleSkillAssessment(staff, {
    assessmentId: input.assessmentId,
    scheduledAt: new Date(scheduledAt),
    assessmentCentreId: input.assessmentCentreId,
    location: input.location,
  });
  revalidatePath(ASSESSMENTS_PATH, "layout");
  return ok(undefined, "Assessment rescheduled. The candidate has been notified.");
});
