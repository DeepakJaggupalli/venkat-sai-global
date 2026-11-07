import "server-only";

/**
 * Candidates module — public write API (see README.md). Every function takes a CandidateActor
 * (`selfActor(await requireCandidate())`, or `staffActor(staffCtx, candidateId)` for staff with
 * candidates.manage), validates ownership, writes in one transaction, recomputes the derived
 * profile columns and audits what matters.
 */
export { selfActor, staffActor } from "./actor";
export { ensureCandidateProfile, getCandidateById, getCandidateByUserId, requireCandidate } from "./guard";
export { refreshCandidateDerived, refreshSkillCaches, recomputeVerificationLevel, computeCandidateCompleteness, type SkillCaches } from "./derived";
export { updatePersonalDetails, updateProfessionalSummary, updateJobPreferences, setCandidateResume, setCandidatePhoto } from "./profile-service";
export {
  saveEducation,
  deleteEducation,
  reorderEducation,
  saveExperience,
  deleteExperience,
  reorderExperience,
  setEducationVerification,
  setExperienceVerification,
} from "./career-service";
export { replaceCandidateSkills, upsertCandidateSkill, removeCandidateSkill, replaceCandidateLanguages, replacePreferredLocations } from "./skills-service";
export {
  saveCandidateDocument,
  setDocumentSharing,
  deleteCandidateDocument,
  submitDocumentForVerification,
  saveCandidateCredential,
  deleteCandidateCredential,
  submitCredentialForVerification,
} from "./documents-service";
export { savePortfolioItem, deletePortfolioItem, reorderPortfolio } from "./portfolio-service";
export { updatePrivacySettings, updateVisibility, updateCandidateConsents } from "./privacy-service";
export { revokeOrganizationProfileGrants, revokeProfileGrantsForFiles, PROFILE_GRANT_CONTEXT } from "./file-grants";
export { enqueueCandidateRefresh, enqueueSkillRefresh, enqueueCategoryRefresh } from "./tasks";
export { buildCandidateDataExport, type DataExportRequester } from "./export";
