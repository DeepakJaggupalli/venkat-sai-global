/**
 * Operations types for UI code (client-safe: type-only re-exports, erased at compile time).
 */
export type {
  EnquiryStatus,
  EnquiryType,
  GrievanceType,
  InternalNoteVisibility,
  LeadSource,
  LeadStatus,
  LeadType,
  MessageThreadContextType,
  MessageThreadStatus,
  RequirementInterviewMethod,
  RequirementKind,
  RequirementSource,
  RequirementStatus,
  RequirementUrgency,
  StaffTaskPriority,
  StaffTaskStatus,
  SupportTicketCategory,
  SupportTicketChannel,
  SupportTicketPriority,
  SupportTicketStatus,
} from "@/db/schema/operations";

export type { LeadDetail, LeadListFilters, LeadListItem } from "./leads-queries";
export type { EnquiryDetail, EnquiryListFilters, EnquiryListItem } from "./enquiries-queries";
export type {
  EmployerRequirementListItem,
  EmployerRequirementView,
  RequirementLineView,
  RequirementListFilters,
  RequirementListItem,
  StaffRequirementDetail,
} from "./requirements-queries";
export type { RequesterTicketListItem, RequesterTicketView, StaffTicketDetail, StaffTicketListItem, TicketListFilters, TicketMessageView } from "./support-queries";
export type { StaffTaskListFilters, StaffTaskListItem } from "./work-queries";
export type { InternalNoteView } from "./work";
export type { ThreadDetail, ThreadListFilters, ThreadListItem, ThreadMessageView } from "./threads-queries";
export type { DeadlineState, SlaSettings, SlaSnapshot } from "./sla";
export type { ThreadAccess, ThreadViewer } from "./thread-access";
export type { PublicSubmissionResult } from "./enquiries";
export type { ActorPortal } from "./schemas";
