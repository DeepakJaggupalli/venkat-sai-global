import "server-only";

/**
 * Recruitment module — public READ API (barrel). See README.md for signatures and scoping rules.
 */
export {
  listApplicationsForCandidate,
  getApplicationForCandidate,
  listApplicationsForJob,
  getPipelineBoard,
  getEmployerPipelineOverview,
  listApplicationsForStaff,
  getApplicationForStaff,
  getApplicationForEmployer,
  getApplicationStageOptions,
  type JobApplicationFilters,
  type StageView,
  type CandidateStageView,
  type HistoryEntryView,
  type ApplicationAnswerView,
} from "./application-queries";
export { loadCandidateCards } from "./candidate-cards";
export { listApplicationNotes } from "./notes";
export { listTalentLists, getTalentList, getTalentListCompareData } from "./talent-lists";
export { listUnlocksForOrg, listUnlocksForCandidate } from "./unlocks";
export {
  listInterviewsForCandidate,
  listInterviewsForApplication,
  listInterviewsForEmployer,
  listInterviewsForStaff,
  listInterviewsForPartner,
  getInterview,
  type InterviewListFilters,
} from "./interviews";
export { dueReminder, REMINDER_OFFSETS } from "./interview-rules";
export { listOffersForApplication, listOffersForCandidate, listOffersForEmployer, listOffersForStaff } from "./offers";
export { listPlacementsForStaff, listPlacementsForEmployer, getPlacementForApplication, type PlacementListFilters } from "./placements";
export { getMobilisationForStaff, getMobilisationForPartner, getMobilisationForCandidate, listMobilisationsForStaff, type ChecklistItemView } from "./mobilisation";
export {
  listAssignmentsForPartner,
  getAssignmentForPartner,
  listAssignmentsForStaff,
  listSubmissionsForPartner,
  getSubmissionForPartner,
  listSubmissionsForStaff,
  getPartnerPerformance,
  type StaffAssignmentListItem,
} from "./partner-queries";
