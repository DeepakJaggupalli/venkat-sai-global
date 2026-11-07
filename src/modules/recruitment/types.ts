/**
 * Recruitment module types (client-safe: type-only imports).
 * Read models returned by the queries are defined next to them and re-exported here.
 */
import type { OrgContext, StaffContext } from "@/modules/identity/authz";

// ---------------------------------------------------------------------------
// Actors — every service receives the party acting and re-checks authorization for it.
// ---------------------------------------------------------------------------

/** A Venkat Sai staff member (from requireStaff()). Permission keys are checked per operation. */
export type StaffActor = { kind: "staff"; ctx: StaffContext };
/** A member of an employer organisation (from requireOrgMember("employer")). */
export type EmployerActor = { kind: "employer"; ctx: OrgContext<"employer"> };
/** A member of a recruitment partner organisation (from requireOrgMember("recruitment_partner")). */
export type PartnerActor = { kind: "partner"; ctx: OrgContext<"recruitment_partner"> };
/** A signed-in candidate acting on their own records (from requireCandidate() / requireCandidateActor()). */
export type CandidateActor = { kind: "candidate"; userId: string; candidateId: string };
/** Background tasks and domain side effects. `userId` = the person whose action triggered it, if any. */
export type SystemActor = { kind: "system"; userId: string | null };

export type RecruitmentActor = StaffActor | EmployerActor | PartnerActor | CandidateActor | SystemActor;

/** Staff or employer — the two parties that run interviews, offers and talent lists. */
export type HiringActor = StaffActor | EmployerActor;

export type BulkResult = { id: string; ok: true } | { id: string; ok: false; error: string };

export type {
  ApplicationListItem,
  CandidateApplicationDetail,
  CandidateApplicationListItem,
  EmployerApplicationDetail,
  PipelineBoard,
  PipelineCard,
  StaffApplicationDetail,
  StaffApplicationFilters,
  EmployerPipelineOverview,
  CandidateCard,
} from "./application-queries";
export type { ApplicationNoteView } from "./notes";
export type { TalentListSummary, TalentListDetail, TalentCompareRow } from "./talent-lists";
export type { UnlockResult, CandidateContact, OrgUnlockListItem, CandidateUnlockListItem } from "./unlocks";
export type { InterviewView, CandidateInterviewView } from "./interviews";
export type { OfferView, CandidateOfferView } from "./offers";
export type { PlacementView } from "./placements";
export type { MobilisationView, CandidateMobilisationView, ChecklistItemView } from "./mobilisation";
export type {
  PartnerAssignmentView,
  PartnerAssignmentListItem,
  PartnerSubmissionView,
  PartnerSubmissionListItem,
  StaffSubmissionReviewItem,
  PartnerPerformance,
  SubmissionResult,
} from "./partner-queries";
