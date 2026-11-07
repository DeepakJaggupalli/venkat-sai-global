/**
 * Public types of the training module (type-only re-exports; safe to import from client components).
 */
export type { BatchRow, CourseRow, EnrolmentRow, TrainingActor } from "./access";
export type { AttendanceRecordRow, AttendanceSessionRow } from "./attendance";
export type { BatchInstructorRow } from "./batches";
export type { CampusDriveRow, CampusRegistrationRow, DriveRegistrationItem, PublicCampusDrive } from "./campus";
export type { CandidateActor } from "./candidate";
export type { PublicAssessmentCentre } from "./centres";
export type { CandidateCertificateItem, CertificateRow, PublicCertificateVerification } from "./certificates";
export type { CourseModuleRow } from "./courses";
export type { AssessmentScoreRow, CourseAssessmentRow } from "./grading";
export type { InternshipRow, PublicInternship } from "./internships";
export type { CandidatePlacementOutcome, PlacementOutcomeItem, PlacementOutcomeRow } from "./outcomes";
export type {
  BatchDetail,
  BatchEnrolmentItem,
  CandidateEnrolmentItem,
  CatalogueBatch,
  CatalogueCourse,
  CourseProvider,
  InstitutionDashboardStats,
  PublicCourseDetail,
} from "./queries";
export type { CertificateDenial, CertificateIssueCheck, FinalResult } from "./rules";
export type {
  AssessmentCentreInput,
  AssessmentScoreInput,
  AttendanceRecordInput,
  AttendanceSessionInput,
  BatchInput,
  BatchInstructorInput,
  CampusDriveInput,
  CatalogueFilters,
  CourseAssessmentInput,
  CourseInput,
  CourseModuleInput,
  InternshipInput,
  IssueCertificateInput,
  PlacementOutcomeInput,
  RecordSkillAssessmentResultInput,
  RescheduleSkillAssessmentInput,
  ScheduleSkillAssessmentInput,
} from "./schemas";
export type { AssessmentCentreRow, CandidateSkillAssessmentItem, SkillAssessmentListItem, SkillAssessmentRow } from "./skill-assessments";
export type { BatchReminderSummary } from "./tasks";
