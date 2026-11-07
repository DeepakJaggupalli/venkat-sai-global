import "server-only";

/**
 * Jobs module — public write API (see README.md). Actors: `{ kind: "employer", ctx }` (OrgContext
 * with employer.jobs.manage) or `{ kind: "staff", ctx }` (StaffContext with jobs.manage / jobs.approve
 * / jobs.feature). Every function authorises the actor, scopes to the organisation, runs in one
 * transaction and audits the change.
 */
export { createJob, updateJob, duplicateJob, deleteJob, filterManageableJobIds, submitJobForReview, type UpdateJobResult } from "./job-service";
export {
  submitJob,
  withdrawJobSubmission,
  publishJob,
  pauseJob,
  resumeJob,
  closeJob,
  extendJob,
  reopenJob,
  rescheduleJob,
  archiveJob,
} from "./lifecycle-service";
export { promoteJob, featureJob, unfeatureJob, setJobInfoSource, setJobRecruitingAgent, expireFeaturedFlags } from "./promotion-service";
export { recordJobView } from "./views";
export {
  saveJob,
  unsaveJob,
  getSavedJobIds,
  listSavedJobs,
  clearUnavailableSavedJobs,
  listJobAlerts,
  getJobAlert,
  saveJobAlert,
  setJobAlertActive,
  deleteJobAlert,
} from "./saved-alerts-service";
export { matchJobsForAlert, alertCriteriaToFilters } from "./alerts";
export { applyPublication, notifyJobOwner } from "./publication";
export { enqueueJobSkillRefresh, enqueueJobCategoryRefresh } from "./tasks";
