"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { PlatformPermission } from "@/config/permissions";
import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import type { TrainingActor } from "./access";
import { createAttendanceSession, deleteAttendanceSession, recordAttendance, updateAttendanceSession } from "./attendance";
import { addBatchInstructor, cancelBatch, completeBatch, createBatch, openBatch, pauseBatchEnrolment, removeBatchInstructor, startBatch, updateBatch, updateBatchInstructor } from "./batches";
import { createCampusDrive, setCampusDriveStatus, updateCampusDrive, updateCampusRegistrationStatus } from "./campus";
import { issueCertificate, reissueCertificate, revokeCertificate } from "./certificates";
import { addCourseModule, archiveCourse, createCourse, deleteCourse, removeCourseModule, reorderCourseModules, restoreCourse, submitCourseForPublication, updateCourse, updateCourseModule } from "./courses";
import {
  cancelEnrolment,
  completeEnrolment,
  confirmEnrolment,
  markEnrolmentDropped,
  rejectEnrolment,
  updateEnrolmentFee,
  waitlistEnrolment,
} from "./enrolments";
import { computeBatchResults, createCourseAssessment, deleteCourseAssessment, publishAssessmentResults, recordAssessmentScores, setEnrolmentResult, updateCourseAssessment } from "./grading";
import { createInternship, setInternshipStatus, updateInternship } from "./internships";
import { deletePlacementOutcome, recordPlacementOutcome, updatePlacementOutcome } from "./outcomes";
import {
  assessmentScoresSchema,
  attendanceRecordsSchema,
  attendanceSessionSchema,
  batchInstructorSchema,
  batchSchema,
  campusDriveSchema,
  campusDriveStatusSchema,
  campusRegistrationStatusSchema,
  cancelBatchSchema,
  courseAssessmentSchema,
  courseModuleSchema,
  courseSchema,
  enrolmentActionSchema,
  enrolmentFeeSchema,
  enrolmentReasonSchema,
  enrolmentResultSchema,
  internshipSchema,
  internshipStatusSchema,
  issueCertificateSchema,
  placementOutcomeSchema,
  reorderCourseModulesSchema,
  revokeCertificateSchema,
} from "./schemas";

/**
 * Server Actions for training management, used by the Institution Portal (`via: "institution"`, the
 * default — acts for the active institution) and the Command Centre (`via: "admin"` — staff permission).
 * Thin: resolve the actor → call the service (which re-checks access to the record) → revalidate.
 */

const viaField = z.enum(["institution", "admin"]).default("institution");
type Via = z.infer<typeof viaField>;

async function actorFor(via: Via, staffPermission: PlatformPermission): Promise<TrainingActor> {
  return via === "admin" ? requireStaff(staffPermission) : requireOrgMember("institution");
}

function revalidateTraining(via: Via, section: string): void {
  revalidatePath(via === "admin" ? "/admin/training" : `/institution/${section}`, "layout");
}

const withVia = <T extends z.ZodRawShape>(shape: T) => z.object({ via: viaField, ...shape });

// ---------------------------------------------------------------------------
// Courses and modules
// ---------------------------------------------------------------------------

export const createCourseAction = createFormAction(courseSchema.and(z.object({ via: viaField })), async ({ via, ...input }) => {
  const course = await createCourse(await actorFor(via, "training.manage"), input);
  revalidateTraining(via, "courses");
  return ok({ id: course.id, slug: course.slug }, "Course saved as a draft.");
});

export const updateCourseAction = createFormAction(courseSchema.and(z.object({ via: viaField, courseId: f.uuid() })), async ({ via, courseId, ...input }) => {
  const course = await updateCourse(await actorFor(via, "training.manage"), courseId, input);
  revalidateTraining(via, "courses");
  return ok({ status: course.status }, course.status === "pending_approval" ? "Changes saved and sent for review." : "Course saved.");
});

export const submitCourseAction = createAction(withVia({ courseId: f.uuid() }), async ({ via, courseId }) => {
  const result = await submitCourseForPublication(await actorFor(via, "training.manage"), courseId);
  revalidateTraining(via, "courses");
  return ok(result, result.status === "published" ? "Course published." : "Course submitted for review.");
});

export const archiveCourseAction = createAction(withVia({ courseId: f.uuid() }), async ({ via, courseId }) => {
  await archiveCourse(await actorFor(via, "training.manage"), courseId);
  revalidateTraining(via, "courses");
  return ok(undefined, "Course archived.");
});

export const restoreCourseAction = createAction(withVia({ courseId: f.uuid() }), async ({ via, courseId }) => {
  await restoreCourse(await actorFor(via, "training.manage"), courseId);
  revalidateTraining(via, "courses");
  return ok(undefined, "Course restored as a draft.");
});

export const deleteCourseAction = createAction(withVia({ courseId: f.uuid() }), async ({ via, courseId }) => {
  await deleteCourse(await actorFor(via, "training.manage"), courseId);
  revalidateTraining(via, "courses");
  return ok(undefined, "Course deleted.");
});

export const addCourseModuleAction = createFormAction(courseModuleSchema.extend({ via: viaField, courseId: f.uuid() }), async ({ via, courseId, ...input }) => {
  const row = await addCourseModule(await actorFor(via, "training.manage"), courseId, input);
  revalidateTraining(via, "courses");
  return ok({ id: row.id }, "Module added.");
});

export const updateCourseModuleAction = createFormAction(courseModuleSchema.extend({ via: viaField, moduleId: f.uuid() }), async ({ via, moduleId, ...input }) => {
  await updateCourseModule(await actorFor(via, "training.manage"), moduleId, input);
  revalidateTraining(via, "courses");
  return ok(undefined, "Module saved.");
});

export const removeCourseModuleAction = createAction(withVia({ moduleId: f.uuid() }), async ({ via, moduleId }) => {
  await removeCourseModule(await actorFor(via, "training.manage"), moduleId);
  revalidateTraining(via, "courses");
  return ok(undefined, "Module removed.");
});

export const reorderCourseModulesAction = createAction(reorderCourseModulesSchema.extend({ via: viaField }), async ({ via, courseId, moduleIds }) => {
  await reorderCourseModules(await actorFor(via, "training.manage"), courseId, moduleIds);
  revalidateTraining(via, "courses");
  return ok(undefined, "Order saved.");
});

// ---------------------------------------------------------------------------
// Batches and instructors
// ---------------------------------------------------------------------------

export const createBatchAction = createFormAction(batchSchema.and(z.object({ via: viaField, courseId: f.uuid() })), async ({ via, courseId, ...input }) => {
  const batch = await createBatch(await actorFor(via, "training.manage"), courseId, input);
  revalidateTraining(via, "batches");
  return ok({ id: batch.id, code: batch.code }, "Batch scheduled.");
});

export const updateBatchAction = createFormAction(batchSchema.and(z.object({ via: viaField, batchId: f.uuid() })), async ({ via, batchId, ...input }) => {
  await updateBatch(await actorFor(via, "training.manage"), batchId, input);
  revalidateTraining(via, "batches");
  return ok(undefined, "Batch saved.");
});

const BATCH_TRANSITIONS = { open: openBatch, pause: pauseBatchEnrolment, start: startBatch, complete: completeBatch } as const;
const BATCH_MESSAGES = { open: "Enrolment is open.", pause: "Enrolment paused.", start: "Batch started.", complete: "Batch completed." } as const;

export const setBatchStatusAction = createAction(withVia({ batchId: f.uuid(), transition: z.enum(["open", "pause", "start", "complete"]) }), async ({ via, batchId, transition }) => {
  await BATCH_TRANSITIONS[transition](await actorFor(via, "training.manage"), batchId);
  revalidateTraining(via, "batches");
  return ok(undefined, BATCH_MESSAGES[transition]);
});

export const cancelBatchAction = createFormAction(cancelBatchSchema.extend({ via: viaField }), async ({ via, batchId, reason }) => {
  await cancelBatch(await actorFor(via, "training.manage"), batchId, reason);
  revalidateTraining(via, "batches");
  return ok(undefined, "Batch cancelled. Enrolled learners have been notified.");
});

export const addBatchInstructorAction = createFormAction(batchInstructorSchema.and(z.object({ via: viaField, batchId: f.uuid() })), async ({ via, batchId, ...input }) => {
  await addBatchInstructor(await actorFor(via, "training.manage"), batchId, input);
  revalidateTraining(via, "batches");
  return ok(undefined, "Instructor added.");
});

export const updateBatchInstructorAction = createFormAction(batchInstructorSchema.and(z.object({ via: viaField, instructorId: f.uuid() })), async ({ via, instructorId, ...input }) => {
  await updateBatchInstructor(await actorFor(via, "training.manage"), instructorId, input);
  revalidateTraining(via, "batches");
  return ok(undefined, "Instructor saved.");
});

export const removeBatchInstructorAction = createAction(withVia({ instructorId: f.uuid() }), async ({ via, instructorId }) => {
  await removeBatchInstructor(await actorFor(via, "training.manage"), instructorId);
  revalidateTraining(via, "batches");
  return ok(undefined, "Instructor removed.");
});

// ---------------------------------------------------------------------------
// Enrolments
// ---------------------------------------------------------------------------

export const confirmEnrolmentAction = createAction(enrolmentActionSchema.extend({ via: viaField }), async ({ via, enrolmentId }) => {
  await confirmEnrolment(await actorFor(via, "training.manage"), enrolmentId);
  revalidateTraining(via, "students");
  return ok(undefined, "Enrolment confirmed. The learner has been notified.");
});

export const waitlistEnrolmentAction = createAction(enrolmentActionSchema.extend({ via: viaField }), async ({ via, enrolmentId, reason }) => {
  await waitlistEnrolment(await actorFor(via, "training.manage"), enrolmentId, reason);
  revalidateTraining(via, "students");
  return ok(undefined, "Learner added to the waitlist.");
});

const REASONED = { reject: rejectEnrolment, cancel: cancelEnrolment, drop: markEnrolmentDropped } as const;

export const decideEnrolmentAction = createFormAction(enrolmentReasonSchema.extend({ via: viaField, decision: z.enum(["reject", "cancel", "drop"]) }), async ({ via, enrolmentId, reason, decision }) => {
  await REASONED[decision](await actorFor(via, "training.manage"), enrolmentId, reason);
  revalidateTraining(via, "students");
  return ok(undefined, decision === "reject" ? "Application declined." : decision === "cancel" ? "Enrolment cancelled." : "Marked as dropped out.");
});

export const completeEnrolmentAction = createAction(enrolmentResultSchema.partial({ resultStatus: true }).extend({ via: viaField }), async ({ via, enrolmentId, resultStatus, finalScore }) => {
  await completeEnrolment(await actorFor(via, "training.manage"), enrolmentId, resultStatus ? { resultStatus, finalScore } : undefined);
  revalidateTraining(via, "students");
  return ok(undefined, "Marked as completed.");
});

export const updateEnrolmentFeeAction = createAction(enrolmentFeeSchema.extend({ via: viaField }), async ({ via, enrolmentId, feeStatus, paymentReference }) => {
  await updateEnrolmentFee(await actorFor(via, "training.manage"), enrolmentId, { feeStatus, paymentReference });
  revalidateTraining(via, "students");
  return ok(undefined, "Fee status saved.");
});

export const setEnrolmentResultAction = createAction(enrolmentResultSchema.extend({ via: viaField }), async ({ via, enrolmentId, resultStatus, finalScore }) => {
  await setEnrolmentResult(await actorFor(via, "training.manage"), enrolmentId, { resultStatus, finalScore });
  revalidateTraining(via, "assessments");
  return ok(undefined, "Result saved.");
});

// ---------------------------------------------------------------------------
// Attendance and course assessments
// ---------------------------------------------------------------------------

export const createAttendanceSessionAction = createFormAction(attendanceSessionSchema.extend({ via: viaField, batchId: f.uuid() }), async ({ via, batchId, ...input }) => {
  const row = await createAttendanceSession(await actorFor(via, "training.manage"), batchId, input);
  revalidateTraining(via, "students");
  return ok({ id: row.id }, "Session added.");
});

export const updateAttendanceSessionAction = createFormAction(attendanceSessionSchema.extend({ via: viaField, sessionId: f.uuid() }), async ({ via, sessionId, ...input }) => {
  await updateAttendanceSession(await actorFor(via, "training.manage"), sessionId, input);
  revalidateTraining(via, "students");
  return ok(undefined, "Session saved.");
});

export const deleteAttendanceSessionAction = createAction(withVia({ sessionId: f.uuid() }), async ({ via, sessionId }) => {
  await deleteAttendanceSession(await actorFor(via, "training.manage"), sessionId);
  revalidateTraining(via, "students");
  return ok(undefined, "Session deleted.");
});

/** Attendance register: `records:json` = [{ enrolmentId, status, remarks? }]. */
export const recordAttendanceAction = createFormAction(attendanceRecordsSchema.extend({ via: viaField }), async ({ via, sessionId, records }) => {
  const result = await recordAttendance(await actorFor(via, "training.manage"), sessionId, records);
  revalidateTraining(via, "students");
  return ok(result, "Attendance saved.");
});

export const createCourseAssessmentAction = createFormAction(courseAssessmentSchema.and(z.object({ via: viaField, batchId: f.uuid() })), async ({ via, batchId, ...input }) => {
  const row = await createCourseAssessment(await actorFor(via, "training.manage"), batchId, input);
  revalidateTraining(via, "assessments");
  return ok({ id: row.id }, "Assessment added.");
});

export const updateCourseAssessmentAction = createFormAction(courseAssessmentSchema.and(z.object({ via: viaField, assessmentId: f.uuid() })), async ({ via, assessmentId, ...input }) => {
  await updateCourseAssessment(await actorFor(via, "training.manage"), assessmentId, input);
  revalidateTraining(via, "assessments");
  return ok(undefined, "Assessment saved.");
});

export const deleteCourseAssessmentAction = createAction(withVia({ assessmentId: f.uuid() }), async ({ via, assessmentId }) => {
  await deleteCourseAssessment(await actorFor(via, "training.manage"), assessmentId);
  revalidateTraining(via, "assessments");
  return ok(undefined, "Assessment deleted.");
});

/** Score sheet: `scores:json` = [{ enrolmentId, score?, isAbsent, remarks? }]. */
export const recordAssessmentScoresAction = createFormAction(assessmentScoresSchema.extend({ via: viaField }), async ({ via, assessmentId, scores }) => {
  const result = await recordAssessmentScores(await actorFor(via, "training.manage"), assessmentId, scores);
  revalidateTraining(via, "assessments");
  return ok(result, "Scores saved.");
});

export const publishAssessmentResultsAction = createAction(withVia({ assessmentId: f.uuid() }), async ({ via, assessmentId }) => {
  await publishAssessmentResults(await actorFor(via, "training.manage"), assessmentId);
  revalidateTraining(via, "assessments");
  return ok(undefined, "Results published to learners.");
});

export const computeBatchResultsAction = createAction(withVia({ batchId: f.uuid() }), async ({ via, batchId }) => {
  const result = await computeBatchResults(await actorFor(via, "training.manage"), batchId);
  revalidateTraining(via, "assessments");
  return ok(result, result.incomplete ? `Results calculated. ${result.incomplete} learner(s) still have missing marks.` : "Results calculated.");
});

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export const issueCertificateAction = createFormAction(issueCertificateSchema.and(z.object({ via: viaField })), async ({ via, ...input }) => {
  const cert = await issueCertificate(await actorFor(via, "training.certificates"), input);
  revalidateTraining(via, "certificates");
  return ok({ id: cert.id, code: cert.code }, "Certificate issued. The learner has been notified.");
});

export const revokeCertificateAction = createFormAction(revokeCertificateSchema.extend({ via: viaField }), async ({ via, certificateId, reason }) => {
  await revokeCertificate(await actorFor(via, "training.certificates"), certificateId, reason);
  revalidateTraining(via, "certificates");
  return ok(undefined, "Certificate revoked.");
});

export const reissueCertificateAction = createFormAction(
  revokeCertificateSchema.extend({ via: viaField, title: f.optionalText(200), expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  async ({ via, certificateId, reason, title, expiresOn }) => {
    const cert = await reissueCertificate(await actorFor(via, "training.certificates"), certificateId, { reason, title, expiresOn });
    revalidateTraining(via, "certificates");
    return ok({ id: cert.id, code: cert.code }, "Corrected certificate issued; the previous one was revoked.");
  },
);

// ---------------------------------------------------------------------------
// Campus drives, internships, placement outcomes
// ---------------------------------------------------------------------------

export const createCampusDriveAction = createFormAction(campusDriveSchema.and(z.object({ via: viaField })), async ({ via, ...input }) => {
  const drive = await createCampusDrive(await actorFor(via, "training.manage"), input);
  revalidateTraining(via, "placements");
  return ok({ id: drive.id, code: drive.code }, "Drive created.");
});

export const updateCampusDriveAction = createFormAction(campusDriveSchema.and(z.object({ via: viaField, driveId: f.uuid() })), async ({ via, driveId, ...input }) => {
  await updateCampusDrive(await actorFor(via, "training.manage"), driveId, input);
  revalidateTraining(via, "placements");
  return ok(undefined, "Drive saved.");
});

export const setCampusDriveStatusAction = createFormAction(campusDriveStatusSchema.extend({ via: viaField }), async ({ via, driveId, status, reason }) => {
  await setCampusDriveStatus(await actorFor(via, "training.manage"), driveId, status, reason);
  revalidateTraining(via, "placements");
  return ok(undefined, "Drive updated.");
});

export const updateCampusRegistrationStatusAction = createAction(campusRegistrationStatusSchema.extend({ via: viaField }), async ({ via, registrationId, status }) => {
  await updateCampusRegistrationStatus(await actorFor(via, "training.manage"), registrationId, status);
  revalidateTraining(via, "placements");
  return ok(undefined, "Registration updated.");
});

export const createInternshipAction = createFormAction(internshipSchema.and(z.object({ via: viaField })), async ({ via, ...input }) => {
  const row = await createInternship(await actorFor(via, "training.manage"), input);
  revalidateTraining(via, "placements");
  return ok({ id: row.id }, "Internship programme saved as a draft.");
});

export const updateInternshipAction = createFormAction(internshipSchema.and(z.object({ via: viaField, internshipId: f.uuid() })), async ({ via, internshipId, ...input }) => {
  await updateInternship(await actorFor(via, "training.manage"), internshipId, input);
  revalidateTraining(via, "placements");
  return ok(undefined, "Internship programme saved.");
});

export const setInternshipStatusAction = createAction(internshipStatusSchema.extend({ via: viaField }), async ({ via, internshipId, status }) => {
  await setInternshipStatus(await actorFor(via, "training.manage"), internshipId, status);
  revalidateTraining(via, "placements");
  return ok(undefined, "Internship programme updated.");
});

export const recordPlacementOutcomeAction = createFormAction(placementOutcomeSchema.and(z.object({ via: viaField })), async ({ via, ...input }) => {
  const row = await recordPlacementOutcome(await actorFor(via, "training.manage"), input);
  revalidateTraining(via, "placements");
  return ok({ id: row.id }, "Outcome recorded. It counts as self-reported until Venkat Sai verifies the evidence.");
});

export const updatePlacementOutcomeAction = createFormAction(placementOutcomeSchema.and(z.object({ via: viaField, outcomeId: f.uuid() })), async ({ via, outcomeId, ...input }) => {
  await updatePlacementOutcome(await actorFor(via, "training.manage"), outcomeId, input);
  revalidateTraining(via, "placements");
  return ok(undefined, "Outcome saved.");
});

export const deletePlacementOutcomeAction = createAction(withVia({ outcomeId: f.uuid() }), async ({ via, outcomeId }) => {
  await deletePlacementOutcome(await actorFor(via, "training.manage"), outcomeId);
  revalidateTraining(via, "placements");
  return ok(undefined, "Outcome deleted.");
});
