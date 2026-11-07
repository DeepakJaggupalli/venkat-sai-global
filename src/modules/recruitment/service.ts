import "server-only";

/**
 * Recruitment module — public WRITE API (barrel). See README.md for signatures and rules.
 * Every function takes the acting party (actor / context) and re-checks authorization and scope.
 */
export { asCandidate, asEmployer, asPartner, asStaff, systemActor, actorUserId, actorType, actorOrganizationId } from "./actors";
export {
  createApplication,
  createApplicationInTx,
  transitionApplication,
  bulkTransitionApplications,
  withdrawApplication,
  shareApplicationsWithEmployer,
  assignApplicationOwner,
  updateApplicationReview,
  type CreatedApplication,
  type ApplicationOrigin,
  type ApplicationCoreInput,
} from "./applications";
export { requireCandidateActor } from "./candidate-actor";
export { addApplicationNote, updateApplicationNote, deleteApplicationNote, noteVisibilityFor } from "./notes";
export {
  createTalentList,
  updateTalentList,
  deleteTalentList,
  addCandidatesToList,
  removeCandidateFromList,
  updateTalentListItem,
  type TalentListActor,
} from "./talent-lists";
export { unlockCandidate, revealCandidateContact, revealCandidateContactForStaff, revokeUnlocksForCandidate, revokeGrantsForLapsedUnlocks } from "./unlocks";
export {
  scheduleInterview,
  rescheduleInterview,
  cancelInterview,
  completeInterview,
  updateInterviewParticipants,
  submitInterviewFeedback,
  respondToInterview,
  sendDueInterviewReminders,
} from "./interviews";
export { createOffer, updateOffer, issueOffer, withdrawOffer, reviseOffer, respondToOffer, expireDueOffers } from "./offers";
export { confirmJoined, updatePlacement, linkReplacementPlacement, canChangePlacementStatus } from "./placements";
export { startMobilisation, updateMobilisation, addChecklistItem, submitChecklistItem, reviewChecklistItem } from "./mobilisation";
export { createPartnerAssignment, updatePartnerAssignment, canChangeAssignmentStatus, ASSIGNMENT_WARNINGS, type AssignmentWarning } from "./partner-assignments";
export {
  submitCandidateByPartner,
  withdrawPartnerSubmission,
  startSubmissionReview,
  acceptPartnerSubmission,
  rejectPartnerSubmission,
  reopenDuplicateSubmission,
  resolveDuplicateFlag,
  updateAttribution,
  expireAttributions,
  PARTNER_CONSENT_ATTESTATION,
} from "./partner-submissions";
export { seedDefaultWorkflow } from "./seed";
export { getAttributionWindowDays, PARTNER_ATTRIBUTION_DAYS_SETTING } from "./settings";
