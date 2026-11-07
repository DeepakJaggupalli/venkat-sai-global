"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { toMinorUnits } from "@/lib/format";
import { assertGuardianConsentIfMinor, requireCandidate } from "@/modules/candidates/guard";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import { asCandidate, asEmployer, asPartner, asStaff } from "./actors";
import { assignApplicationOwner, bulkTransitionApplications, createApplication, shareApplicationsWithEmployer, transitionApplication, updateApplicationReview, withdrawApplication } from "./applications";
import { requireCandidateActor } from "./candidate-actor";
import { cancelInterview, completeInterview, rescheduleInterview, respondToInterview, scheduleInterview, submitInterviewFeedback, updateInterviewParticipants } from "./interviews";
import { addApplicationNote, deleteApplicationNote, updateApplicationNote } from "./notes";
import { createOffer, issueOffer, respondToOffer, reviseOffer, updateOffer, withdrawOffer } from "./offers";
import { createPartnerAssignment, updatePartnerAssignment } from "./partner-assignments";
import {
  acceptPartnerSubmission,
  rejectPartnerSubmission,
  reopenDuplicateSubmission,
  resolveDuplicateFlag,
  startSubmissionReview,
  submitCandidateByPartner,
  updateAttribution,
  withdrawPartnerSubmission,
} from "./partner-submissions";
import { addChecklistItem, reviewChecklistItem, startMobilisation, submitChecklistItem, updateMobilisation } from "./mobilisation";
import { confirmJoined, linkReplacementPlacement, updatePlacement } from "./placements";
import {
  acceptSubmissionSchema,
  addChecklistItemSchema,
  applicationNoteSchema,
  applicationReviewSchema,
  assignApplicationOwnerSchema,
  bulkTransitionSchema,
  cancelInterviewSchema,
  candidateApplyFormSchema,
  completeInterviewSchema,
  confirmJoinedSchema,
  createAssignmentSchema,
  createOfferSchema,
  interviewFeedbackSchema,
  interviewParticipantsSchema,
  interviewResponseSchema,
  issueOfferSchema,
  linkReplacementSchema,
  partnerSubmissionSchema,
  rejectSubmissionSchema,
  rescheduleInterviewSchema,
  resolveDuplicateFlagSchema,
  respondToOfferSchema,
  reviewChecklistItemSchema,
  scheduleInterviewSchema,
  shareApplicationsSchema,
  staffAssignSchema,
  startMobilisationSchema,
  submitChecklistItemSchema,
  talentListItemUpdateSchema,
  talentListItemsSchema,
  talentListSchema,
  transitionSchema,
  unlockCandidateSchema,
  updateApplicationNoteSchema,
  updateAssignmentSchema,
  updateAttributionSchema,
  updateMobilisationSchema,
  updateOfferSchema,
  updatePlacementSchema,
  updateTalentListSchema,
  withdrawApplicationSchema,
  withdrawOfferSchema,
} from "./schemas";
import { addCandidatesToList, createTalentList, deleteTalentList, removeCandidateFromList, updateTalentList, updateTalentListItem } from "./talent-lists";
import type { HiringActor } from "./types";
import { revealCandidateContact, revealCandidateContactForStaff, unlockCandidate } from "./unlocks";

/**
 * Server Actions for the portals — thin: authorize (guard) → validate (zod) → service → revalidate.
 * Services re-check permissions and scope for the actor. Actions shared by the Employer Portal and
 * the Command Centre take `portal: "employer" | "admin"` to pick the guard; the guard, not the
 * client, decides who the actor is.
 */

const hiringPortal = z.enum(["employer", "admin"]);
const notePortal = z.enum(["employer", "admin", "recruiter"]);
const uuid = z.uuid("Invalid identifier");

async function hiringActor(portal: z.infer<typeof hiringPortal>): Promise<HiringActor> {
  return portal === "admin" ? asStaff(await requireStaff()) : asEmployer(await requireOrgMember("employer"));
}

function revalidatePipelines(): void {
  revalidatePath("/employer/pipeline", "layout");
  revalidatePath("/admin/pipeline", "layout");
  revalidatePath("/talent/applications", "layout");
}

// ---------------------------------------------------------------------------
// People Portal (candidates)
// ---------------------------------------------------------------------------

export const applyToJobAction = createFormAction(candidateApplyFormSchema, async (input) => {
  const session = await requireCandidate();
  // Applying shares a child's profile with an employer: refused until a guardian consents (DPDP Act s.9).
  await assertGuardianConsentIfMinor(session.candidate);
  const actor = asCandidate(session);
  const expectedSalary =
    input.expectedSalaryAmount !== undefined && input.expectedSalaryCurrency && input.expectedSalaryPeriod
      ? { amountMinor: toMinorUnits(input.expectedSalaryAmount, input.expectedSalaryCurrency), currency: input.expectedSalaryCurrency, period: input.expectedSalaryPeriod }
      : null;
  const created = await createApplication(actor, {
    jobId: input.jobId,
    coverLetter: input.coverLetter,
    resumeFileId: input.resumeFileId,
    answers: input.answers,
    expectedSalary,
    consentToShare: true,
  });
  revalidatePath("/talent/applications", "layout");
  return ok({ id: created.id, code: created.code }, created.reopened ? "Your application has been submitted again." : "Your application has been submitted.");
});

export const withdrawApplicationAction = createAction(withdrawApplicationSchema, async (input) => {
  const actor = await requireCandidateActor();
  await withdrawApplication(actor, input.applicationId, { reason: input.reason });
  revalidatePipelines();
  return ok(undefined, "Your application has been withdrawn.");
});

export const respondToInterviewAction = createAction(interviewResponseSchema, async (input) => {
  const actor = await requireCandidateActor();
  await respondToInterview(actor, input);
  revalidatePath("/talent/interviews");
  revalidatePath("/talent/applications", "layout");
  return ok(undefined, "Your response has been sent.");
});

export const respondToOfferAction = createAction(respondToOfferSchema, async (input) => {
  const actor = await requireCandidateActor();
  const result = await respondToOffer(actor, input);
  revalidatePipelines();
  return ok(result, input.response === "accept" ? "You have accepted the offer." : "You have declined the offer.");
});

// ---------------------------------------------------------------------------
// Pipeline (Employer Portal + Command Centre)
// ---------------------------------------------------------------------------

export const transitionApplicationAction = createAction(transitionSchema.extend({ portal: hiringPortal }), async ({ portal, applicationId, toStageKey, ...opts }) => {
  const actor = await hiringActor(portal);
  const result = await transitionApplication(applicationId, toStageKey, actor, opts);
  revalidatePipelines();
  return ok(result, "Application moved.");
});

export const bulkTransitionApplicationsAction = createAction(bulkTransitionSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  const actor = await hiringActor(portal);
  const results = await bulkTransitionApplications(actor, input);
  revalidatePipelines();
  const moved = results.filter((r) => r.ok).length;
  return ok(results, `${moved} of ${results.length} applications moved.`);
});

export const updateApplicationReviewAction = createAction(applicationReviewSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await updateApplicationReview(await hiringActor(portal), input);
  revalidatePipelines();
  return ok(undefined, "Saved.");
});

export const addApplicationNoteAction = createAction(applicationNoteSchema.extend({ portal: notePortal }), async ({ portal, ...input }) => {
  const actor = portal === "recruiter" ? asPartner(await requireOrgMember("recruitment_partner")) : await hiringActor(portal);
  const note = await addApplicationNote(actor, input);
  revalidatePipelines();
  return ok(note, "Note added.");
});

export const updateApplicationNoteAction = createAction(updateApplicationNoteSchema.extend({ portal: notePortal }), async ({ portal, ...input }) => {
  const actor = portal === "recruiter" ? asPartner(await requireOrgMember("recruitment_partner")) : await hiringActor(portal);
  await updateApplicationNote(actor, input);
  revalidatePipelines();
  return ok(undefined, "Note updated.");
});

export const deleteApplicationNoteAction = createAction(z.object({ noteId: uuid, portal: notePortal }), async ({ portal, noteId }) => {
  const actor = portal === "recruiter" ? asPartner(await requireOrgMember("recruitment_partner")) : await hiringActor(portal);
  await deleteApplicationNote(actor, noteId);
  revalidatePipelines();
  return ok(undefined, "Note deleted.");
});

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export const scheduleInterviewAction = createAction(scheduleInterviewSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  const created = await scheduleInterview(await hiringActor(portal), input);
  revalidatePath("/employer/interviews");
  revalidatePath("/admin/interviews");
  revalidatePipelines();
  return ok(created, "Interview scheduled.");
});

export const rescheduleInterviewAction = createAction(rescheduleInterviewSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await rescheduleInterview(await hiringActor(portal), input);
  revalidatePath("/employer/interviews");
  revalidatePath("/admin/interviews");
  return ok(undefined, "Interview rescheduled.");
});

export const cancelInterviewAction = createAction(cancelInterviewSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await cancelInterview(await hiringActor(portal), input);
  revalidatePath("/employer/interviews");
  revalidatePath("/admin/interviews");
  return ok(undefined, "Interview cancelled.");
});

export const completeInterviewAction = createAction(completeInterviewSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await completeInterview(await hiringActor(portal), input);
  revalidatePath("/employer/interviews");
  revalidatePath("/admin/interviews");
  revalidatePipelines();
  return ok(undefined, "Interview updated.");
});

export const submitInterviewFeedbackAction = createAction(interviewFeedbackSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await submitInterviewFeedback(await hiringActor(portal), input);
  return ok(undefined, "Feedback saved.");
});

export const updateInterviewParticipantsAction = createAction(interviewParticipantsSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await updateInterviewParticipants(await hiringActor(portal), input);
  return ok(undefined, "Interview panel updated.");
});

// ---------------------------------------------------------------------------
// Offers and placements
// ---------------------------------------------------------------------------

export const createOfferAction = createAction(createOfferSchema.and(z.object({ portal: hiringPortal })), async ({ portal, ...input }) => {
  const created = await createOffer(await hiringActor(portal), input);
  revalidatePath("/employer/offers");
  return ok(created, "Offer saved as a draft.");
});

export const updateOfferAction = createAction(updateOfferSchema.and(z.object({ portal: hiringPortal })), async ({ portal, ...input }) => {
  await updateOffer(await hiringActor(portal), input);
  revalidatePath("/employer/offers");
  return ok(undefined, "Offer updated.");
});

export const issueOfferAction = createAction(issueOfferSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await issueOffer(await hiringActor(portal), input);
  revalidatePath("/employer/offers");
  revalidatePipelines();
  return ok(undefined, "Offer sent to the candidate.");
});

export const withdrawOfferAction = createAction(withdrawOfferSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await withdrawOffer(await hiringActor(portal), input);
  revalidatePath("/employer/offers");
  revalidatePipelines();
  return ok(undefined, "Offer withdrawn.");
});

export const reviseOfferAction = createAction(updateOfferSchema.and(z.object({ portal: hiringPortal })), async ({ portal, offerId, ...fields }) => {
  const created = await reviseOffer(await hiringActor(portal), offerId, fields);
  revalidatePath("/employer/offers");
  revalidatePipelines();
  return ok(created, "Revised offer saved as a draft. Issue it to send it to the candidate.");
});

export const confirmJoinedAction = createAction(confirmJoinedSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await confirmJoined(await hiringActor(portal), input);
  revalidatePath("/employer/offers");
  revalidatePath("/admin/mobilisation", "layout");
  revalidatePipelines();
  return ok(undefined, "Joining confirmed.");
});

export const updatePlacementAction = createAction(updatePlacementSchema.and(z.object({ portal: hiringPortal })), async ({ portal, ...input }) => {
  await updatePlacement(await hiringActor(portal), input);
  revalidatePath("/employer/offers");
  revalidatePath("/admin/mobilisation", "layout");
  return ok(undefined, "Placement updated.");
});

// ---------------------------------------------------------------------------
// Talent lists (Employer Portal + Command Centre)
// ---------------------------------------------------------------------------

export const createTalentListAction = createAction(talentListSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  const created = await createTalentList(await hiringActor(portal), input);
  revalidatePath("/employer/lists", "layout");
  return ok(created, "List created.");
});

export const updateTalentListAction = createAction(updateTalentListSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await updateTalentList(await hiringActor(portal), input);
  revalidatePath("/employer/lists", "layout");
  return ok(undefined, "List updated.");
});

export const deleteTalentListAction = createAction(z.object({ listId: uuid, portal: hiringPortal }), async ({ portal, listId }) => {
  await deleteTalentList(await hiringActor(portal), listId);
  revalidatePath("/employer/lists", "layout");
  return ok(undefined, "List deleted.");
});

export const addCandidatesToListAction = createAction(talentListItemsSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  const results = await addCandidatesToList(await hiringActor(portal), input);
  revalidatePath("/employer/lists", "layout");
  const added = results.filter((r) => r.ok).length;
  if (!added) throw new ActionError("None of these candidates can be added.");
  return ok(results, added === 1 ? "Candidate added to the list." : `${added} candidates added to the list.`);
});

export const removeCandidateFromListAction = createAction(z.object({ listId: uuid, candidateId: uuid, portal: hiringPortal }), async ({ portal, ...input }) => {
  await removeCandidateFromList(await hiringActor(portal), input);
  revalidatePath("/employer/lists", "layout");
  return ok(undefined, "Candidate removed from the list.");
});

export const updateTalentListItemAction = createAction(talentListItemUpdateSchema.extend({ portal: hiringPortal }), async ({ portal, ...input }) => {
  await updateTalentListItem(await hiringActor(portal), input);
  revalidatePath("/employer/lists", "layout");
  return ok(undefined, "Saved.");
});

// ---------------------------------------------------------------------------
// Unlocks (Employer Portal)
// ---------------------------------------------------------------------------

export const unlockCandidateAction = createAction(unlockCandidateSchema, async (input) => {
  const ctx = await requireOrgMember("employer", "employer.candidates.unlock");
  const result = await unlockCandidate(ctx, input.candidateId, { jobId: input.jobId, reason: input.reason });
  revalidatePath("/employer/candidates", "layout");
  return ok(result, result.creditConsumed ? "Contact details unlocked." : undefined);
});

export const revealCandidateContactAction = createAction(z.object({ candidateId: uuid }), async ({ candidateId }) => {
  const ctx = await requireOrgMember("employer");
  return ok(await revealCandidateContact(ctx, candidateId));
});

export const revealCandidateContactForStaffAction = createAction(z.object({ candidateId: uuid, reason: z.string().trim().min(3).max(300) }), async ({ candidateId, reason }) => {
  const ctx = await requireStaff("candidates.view_contact");
  return ok(await revealCandidateContactForStaff(ctx, candidateId, reason));
});

// ---------------------------------------------------------------------------
// Command Centre only
// ---------------------------------------------------------------------------

export const assignCandidateToJobAction = createAction(staffAssignSchema, async (input) => {
  const ctx = await requireStaff("recruitment.manage");
  const created = await createApplication(asStaff(ctx), input);
  revalidatePipelines();
  return ok({ id: created.id, code: created.code }, "Candidate added to the job.");
});

export const shareApplicationsWithEmployerAction = createAction(shareApplicationsSchema, async ({ applicationIds }) => {
  const ctx = await requireStaff("recruitment.manage");
  const results = await shareApplicationsWithEmployer(ctx, applicationIds);
  revalidatePipelines();
  return ok(results, `${results.filter((r) => r.ok).length} of ${results.length} applications shared with the employer.`);
});

export const assignApplicationOwnerAction = createAction(assignApplicationOwnerSchema, async (input) => {
  await assignApplicationOwner(await requireStaff("recruitment.manage"), input);
  revalidatePath("/admin/pipeline", "layout");
  return ok(undefined, "Owner updated.");
});

export const createPartnerAssignmentAction = createAction(createAssignmentSchema, async (input) => {
  const result = await createPartnerAssignment(await requireStaff("partners.assign"), input);
  revalidatePath("/admin/partners", "layout");
  return ok(result, result.warnings.length ? "Assignment created. Check the compliance warning." : "Assignment created.");
});

export const updatePartnerAssignmentAction = createAction(updateAssignmentSchema, async (input) => {
  await updatePartnerAssignment(await requireStaff("partners.assign"), input);
  revalidatePath("/admin/partners", "layout");
  return ok(undefined, "Assignment updated.");
});

export const startSubmissionReviewAction = createAction(z.object({ submissionId: uuid }), async ({ submissionId }) => {
  await startSubmissionReview(await requireStaff("recruitment.manage"), submissionId);
  revalidatePath("/admin/partners", "layout");
  return ok(undefined, "Submission marked as under review.");
});

export const acceptPartnerSubmissionAction = createAction(acceptSubmissionSchema, async (input) => {
  const result = await acceptPartnerSubmission(await requireStaff("recruitment.manage"), input);
  revalidatePath("/admin/partners", "layout");
  revalidatePipelines();
  return ok(result, "Submission accepted and application created.");
});

export const rejectPartnerSubmissionAction = createAction(rejectSubmissionSchema, async (input) => {
  await rejectPartnerSubmission(await requireStaff("recruitment.manage"), input);
  revalidatePath("/admin/partners", "layout");
  return ok(undefined, "Submission rejected.");
});

export const reopenDuplicateSubmissionAction = createAction(z.object({ submissionId: uuid, reviewNotes: z.string().trim().max(4000).optional() }), async (input) => {
  await reopenDuplicateSubmission(await requireStaff(["recruitment.manage", "partners.manage"]), input);
  revalidatePath("/admin/partners", "layout");
  return ok(undefined, "Submission moved back to review.");
});

export const resolveDuplicateFlagAction = createAction(resolveDuplicateFlagSchema, async (input) => {
  await resolveDuplicateFlag(await requireStaff("candidates.manage"), input);
  revalidatePath("/admin/candidates", "layout");
  return ok(undefined, "Duplicate flag resolved.");
});

export const updateAttributionAction = createAction(updateAttributionSchema, async (input) => {
  await updateAttribution(await requireStaff("partners.manage"), input);
  revalidatePath("/admin/partners", "layout");
  return ok(undefined, "Attribution updated.");
});

export const startMobilisationAction = createAction(startMobilisationSchema, async (input) => {
  const result = await startMobilisation(await requireStaff("recruitment.mobilisation"), input);
  revalidatePath("/admin/mobilisation", "layout");
  return ok(result, "Mobilisation started.");
});

export const updateMobilisationAction = createAction(updateMobilisationSchema, async (input) => {
  await updateMobilisation(await requireStaff("recruitment.mobilisation"), input);
  revalidatePath("/admin/mobilisation", "layout");
  revalidatePath("/talent/applications", "layout");
  return ok(undefined, "Mobilisation updated.");
});

export const addChecklistItemAction = createAction(addChecklistItemSchema, async (input) => {
  const created = await addChecklistItem(await requireStaff("recruitment.mobilisation"), input);
  revalidatePath("/admin/mobilisation", "layout");
  return ok(created, "Checklist item added.");
});

export const reviewChecklistItemAction = createAction(reviewChecklistItemSchema, async (input) => {
  await reviewChecklistItem(await requireStaff("recruitment.mobilisation"), input);
  revalidatePath("/admin/mobilisation", "layout");
  revalidatePath("/talent/applications", "layout");
  return ok(undefined, "Checklist item updated.");
});

export const linkReplacementPlacementAction = createAction(linkReplacementSchema, async (input) => {
  await linkReplacementPlacement(await requireStaff("recruitment.mobilisation"), input);
  revalidatePath("/admin/mobilisation", "layout");
  return ok(undefined, "Replacement recorded.");
});

/** Checklist submission from the People Portal (candidate), Partner Portal or Command Centre. */
export const submitChecklistItemAction = createAction(submitChecklistItemSchema.extend({ portal: z.enum(["talent", "recruiter", "admin"]) }), async ({ portal, ...input }) => {
  const actor =
    portal === "talent" ? await requireCandidateActor() : portal === "recruiter" ? asPartner(await requireOrgMember("recruitment_partner", "partner.documents.manage")) : asStaff(await requireStaff("recruitment.mobilisation"));
  await submitChecklistItem(actor, input);
  revalidatePath("/talent/applications", "layout");
  revalidatePath("/admin/mobilisation", "layout");
  return ok(undefined, "Submitted for checking.");
});

// ---------------------------------------------------------------------------
// Recruitment Partner Portal
// ---------------------------------------------------------------------------

export const submitCandidateAction = createAction(partnerSubmissionSchema, async ({ assignmentId, ...input }) => {
  const ctx = await requireOrgMember("recruitment_partner", "partner.candidates.submit");
  const result = await submitCandidateByPartner(ctx, assignmentId, input);
  revalidatePath("/recruiter/submissions", "layout");
  revalidatePath("/recruiter/requirements", "layout");
  return ok(result, result.status === "duplicate" ? "Submitted. This candidate is already represented by another partner, so the submission is marked as a duplicate for review." : "Candidate submitted for review.");
});

export const withdrawSubmissionAction = createAction(z.object({ submissionId: uuid }), async ({ submissionId }) => {
  const ctx = await requireOrgMember("recruitment_partner", "partner.candidates.submit");
  await withdrawPartnerSubmission(ctx, submissionId);
  revalidatePath("/recruiter/submissions", "layout");
  return ok(undefined, "Submission withdrawn.");
});
