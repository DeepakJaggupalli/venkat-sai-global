/**
 * Route contract for links this module puts into notifications (relative paths, client-safe).
 * Portal teams build these pages; keep this file and README.md in sync when a route changes.
 */
export const recruitmentLinks = {
  // People Portal
  candidateApplication: (applicationId: string): string => `/talent/applications/${applicationId}`,
  candidateApplications: (): string => "/talent/applications",
  candidateInterviews: (): string => "/talent/interviews",
  /** Where a partner-sourced person creates an account with the same email / phone to claim the profile. */
  candidateClaimProfile: (): string => "/sign-up?intent=candidate",

  // Employer Portal
  employerJobPipeline: (jobId: string): string => `/employer/pipeline/${jobId}`,
  employerApplication: (jobId: string, applicationId: string): string => `/employer/pipeline/${jobId}?application=${applicationId}`,
  employerInterviews: (): string => "/employer/interviews",
  employerOffers: (): string => "/employer/offers",

  // Recruitment Partner Portal
  partnerAssignment: (assignmentId: string): string => `/recruiter/requirements/${assignmentId}`,
  partnerSubmission: (submissionId: string): string => `/recruiter/submissions/${submissionId}`,
  partnerInterviews: (): string => "/recruiter/interviews",

  // Command Centre
  staffApplication: (applicationId: string): string => `/admin/pipeline/${applicationId}`,
  staffInterviews: (): string => "/admin/interviews",
  staffMobilisation: (mobilisationId: string): string => `/admin/mobilisation/${mobilisationId}`,
  staffPartnerAssignment: (assignmentId: string): string => `/admin/partners/${assignmentId}`,
  staffPartnerSubmission: (submissionId: string): string => `/admin/partners/submissions/${submissionId}`,
} as const;
