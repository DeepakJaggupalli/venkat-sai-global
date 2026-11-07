"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";

import { createAssessmentCentre, deleteAssessmentCentre, setAssessmentCentreActive, updateAssessmentCentre } from "./centres";
import { setCourseFeatured } from "./courses";
import { enrolCandidateByStaff } from "./enrolments";
import { verifyPlacementOutcome } from "./outcomes";
import {
  assessmentCentreSchema,
  cancelSkillAssessmentSchema,
  recordSkillAssessmentResultSchema,
  rescheduleSkillAssessmentSchema,
  scheduleSkillAssessmentSchema,
  staffEnrolSchema,
} from "./schemas";
import {
  cancelSkillAssessment,
  markSkillAssessmentNoShow,
  publishSkillAssessmentResult,
  recordSkillAssessmentResult,
  rescheduleSkillAssessment,
  scheduleSkillAssessment,
} from "./skill-assessments";

/** Command Centre actions: Venkat Sai skill assessments, assessment centres and training oversight. */

const ASSESSMENTS_PATH = "/admin/assessments";

export const scheduleSkillAssessmentAction = createFormAction(scheduleSkillAssessmentSchema, async (input) => {
  const staff = await requireStaff("recruitment.assessments");
  const row = await scheduleSkillAssessment(staff, input);
  revalidatePath(ASSESSMENTS_PATH, "layout");
  return ok({ id: row.id, code: row.code }, "Assessment scheduled. The candidate has been notified.");
});

export const rescheduleSkillAssessmentAction = createFormAction(rescheduleSkillAssessmentSchema, async (input) => {
  const staff = await requireStaff("recruitment.assessments");
  await rescheduleSkillAssessment(staff, input);
  revalidatePath(ASSESSMENTS_PATH, "layout");
  return ok(undefined, "Assessment rescheduled. The candidate has been notified.");
});

export const cancelSkillAssessmentAction = createFormAction(cancelSkillAssessmentSchema, async (input) => {
  const staff = await requireStaff("recruitment.assessments");
  await cancelSkillAssessment(staff, input);
  revalidatePath(ASSESSMENTS_PATH, "layout");
  return ok(undefined, "Assessment cancelled.");
});

export const markSkillAssessmentNoShowAction = createAction(z.object({ assessmentId: f.uuid() }), async ({ assessmentId }) => {
  const staff = await requireStaff("recruitment.assessments");
  await markSkillAssessmentNoShow(staff, assessmentId);
  revalidatePath(ASSESSMENTS_PATH, "layout");
  return ok(undefined, "Marked as no-show.");
});

export const recordSkillAssessmentResultAction = createFormAction(recordSkillAssessmentResultSchema, async (input) => {
  const staff = await requireStaff("recruitment.assessments");
  const result = await recordSkillAssessmentResult(staff, input);
  revalidatePath(ASSESSMENTS_PATH, "layout");
  return ok(
    { certificateId: result.certificate?.id ?? null },
    result.certificate ? "Result recorded and certificate issued." : input.publish ? "Result recorded and shared with the candidate." : "Result recorded.",
  );
});

export const publishSkillAssessmentResultAction = createAction(z.object({ assessmentId: f.uuid() }), async ({ assessmentId }) => {
  const staff = await requireStaff("recruitment.assessments");
  await publishSkillAssessmentResult(staff, assessmentId);
  revalidatePath(ASSESSMENTS_PATH, "layout");
  return ok(undefined, "Result shared with the candidate.");
});

export const createAssessmentCentreAction = createFormAction(assessmentCentreSchema, async (input) => {
  const staff = await requireStaff("training.manage");
  const row = await createAssessmentCentre(staff, input);
  revalidatePath("/admin/training", "layout");
  return ok({ id: row.id }, "Assessment centre added.");
});

export const updateAssessmentCentreAction = createFormAction(assessmentCentreSchema.extend({ centreId: f.uuid() }), async ({ centreId, ...input }) => {
  const staff = await requireStaff("training.manage");
  await updateAssessmentCentre(staff, centreId, input);
  revalidatePath("/admin/training", "layout");
  return ok(undefined, "Assessment centre saved.");
});

export const setAssessmentCentreActiveAction = createAction(z.object({ centreId: f.uuid(), isActive: z.boolean() }), async ({ centreId, isActive }) => {
  const staff = await requireStaff("training.manage");
  await setAssessmentCentreActive(staff, centreId, isActive);
  revalidatePath("/admin/training", "layout");
  return ok(undefined, isActive ? "Centre reactivated." : "Centre deactivated.");
});

export const deleteAssessmentCentreAction = createAction(z.object({ centreId: f.uuid() }), async ({ centreId }) => {
  const staff = await requireStaff("training.manage");
  await deleteAssessmentCentre(staff, centreId);
  revalidatePath("/admin/training", "layout");
  return ok(undefined, "Centre deleted.");
});

export const enrolCandidateByStaffAction = createAction(staffEnrolSchema, async ({ batchId, candidateId }) => {
  const staff = await requireStaff("training.manage");
  await enrolCandidateByStaff(staff, batchId, candidateId);
  revalidatePath("/admin/training", "layout");
  return ok(undefined, "Candidate enrolled.");
});

export const verifyPlacementOutcomeAction = createAction(z.object({ outcomeId: f.uuid(), verified: z.boolean() }), async ({ outcomeId, verified }) => {
  const staff = await requireStaff("training.manage");
  await verifyPlacementOutcome(staff, outcomeId, verified);
  revalidatePath("/admin/training", "layout");
  return ok(undefined, verified ? "Outcome verified." : "Verification removed.");
});

export const setCourseFeaturedAction = createAction(z.object({ courseId: f.uuid(), isFeatured: z.boolean() }), async ({ courseId, isFeatured }) => {
  const staff = await requireStaff("training.manage");
  await setCourseFeatured(staff, courseId, isFeatured);
  revalidatePath("/admin/training", "layout");
  return ok(undefined, isFeatured ? "Course featured." : "Course no longer featured.");
});
