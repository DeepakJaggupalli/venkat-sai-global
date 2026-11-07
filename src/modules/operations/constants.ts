/**
 * Operations labels, value lists and state machines (client-safe: forms, badges and services share them).
 * Value lists are derived from the label maps; `satisfies` keeps them identical to the schema enums
 * (src/db/schema/operations.ts — checked again in constants.test.ts).
 */
import type {
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

const keysOf = <T extends string>(labels: Record<T, string>) => Object.keys(labels) as [T, ...T[]];

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const LEAD_TYPE_LABELS = {
  employer: "Employer",
  partner: "Recruitment partner",
  institution: "Institution",
  candidate: "Candidate",
  other: "Other",
} as const satisfies Record<LeadType, string>;

export const LEAD_SOURCE_LABELS = {
  website_form: "Website form",
  requirement_form: "Requirement form",
  referral: "Referral",
  event: "Event",
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  walk_in: "Walk-in",
  import: "Import",
  other: "Other",
} as const satisfies Record<LeadSource, string>;

export const LEAD_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
  nurturing: "Nurturing",
} as const satisfies Record<LeadStatus, string>;

export const LEAD_TYPE_VALUES = keysOf(LEAD_TYPE_LABELS);
export const LEAD_SOURCE_VALUES = keysOf(LEAD_SOURCE_LABELS);
export const LEAD_STATUS_VALUES = keysOf(LEAD_STATUS_LABELS);

/** Allowed lead moves (won / lost can be reopened for a new opportunity). */
export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ["contacted", "qualified", "nurturing", "lost"],
  contacted: ["qualified", "proposal", "nurturing", "lost"],
  qualified: ["proposal", "won", "nurturing", "lost"],
  proposal: ["won", "lost", "nurturing", "qualified"],
  nurturing: ["contacted", "qualified", "lost"],
  won: ["qualified"],
  lost: ["nurturing", "contacted"],
};

export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "qualified", "proposal", "nurturing"];

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export const ENQUIRY_TYPE_LABELS = {
  general: "General enquiry",
  employer: "Hiring / employer services",
  partner: "Recruitment partnership",
  institution: "Training institution partnership",
  candidate_support: "Help as a candidate",
  media: "Media enquiry",
  grievance: "Grievance or complaint",
  careers: "Careers at Venkat Sai",
} as const satisfies Record<EnquiryType, string>;

export const ENQUIRY_STATUS_LABELS = {
  new: "New",
  in_progress: "In progress",
  responded: "Responded",
  closed: "Closed",
  spam: "Spam",
} as const satisfies Record<EnquiryStatus, string>;

export const ENQUIRY_TYPE_VALUES = keysOf(ENQUIRY_TYPE_LABELS);
export const ENQUIRY_STATUS_VALUES = keysOf(ENQUIRY_STATUS_LABELS);

/** Business enquiries that create (or attach to) a lead. */
export const ENQUIRY_LEAD_TYPE: Partial<Record<EnquiryType, LeadType>> = { employer: "employer", partner: "partner", institution: "institution" };

export const ENQUIRY_TRANSITIONS: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  new: ["in_progress", "responded", "closed", "spam"],
  in_progress: ["responded", "closed", "spam"],
  responded: ["in_progress", "closed"],
  closed: ["in_progress"],
  spam: ["new"],
};

// ---------------------------------------------------------------------------
// Workforce requirements
// ---------------------------------------------------------------------------

export const REQUIREMENT_KIND_LABELS = {
  individual: "Individual hire",
  bulk: "Bulk manpower",
  project: "Project team",
  temporary: "Temporary staff",
  contract: "Contract staff",
  internship: "Internships",
  training: "Training programme",
  campus: "Campus hiring",
} as const satisfies Record<RequirementKind, string>;

export const REQUIREMENT_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  sourcing: "Sourcing candidates",
  in_progress: "In progress",
  partially_filled: "Partially filled",
  filled: "Filled",
  on_hold: "On hold",
  cancelled: "Cancelled",
  closed: "Closed",
} as const satisfies Record<RequirementStatus, string>;

export const REQUIREMENT_URGENCY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
} as const satisfies Record<RequirementUrgency, string>;

export const REQUIREMENT_INTERVIEW_METHOD_LABELS = {
  in_person: "In person",
  video: "Video call",
  phone: "Phone",
  trade_test: "Trade test",
  mixed: "Mixed",
} as const satisfies Record<RequirementInterviewMethod, string>;

export const REQUIREMENT_SOURCE_LABELS = {
  public_form: "Website form",
  employer_portal: "Employer Portal",
  staff_entry: "Entered by staff",
  email: "Email",
  phone: "Phone",
  import: "Import",
} as const satisfies Record<RequirementSource, string>;

export const REQUIREMENT_KIND_VALUES = keysOf(REQUIREMENT_KIND_LABELS);
export const REQUIREMENT_STATUS_VALUES = keysOf(REQUIREMENT_STATUS_LABELS);
export const REQUIREMENT_URGENCY_VALUES = keysOf(REQUIREMENT_URGENCY_LABELS);
export const REQUIREMENT_INTERVIEW_METHOD_VALUES = keysOf(REQUIREMENT_INTERVIEW_METHOD_LABELS);

/**
 * Staff status moves. "approved" is reached only through the approval centre (decideApproval →
 * approval-handlers.ts); "draft" only through a change request; "submitted" only by the submitter.
 */
export const REQUIREMENT_STAFF_TRANSITIONS: Record<RequirementStatus, readonly RequirementStatus[]> = {
  draft: ["cancelled"],
  submitted: ["under_review", "on_hold", "cancelled"],
  under_review: ["on_hold", "cancelled"],
  approved: ["sourcing", "in_progress", "on_hold", "cancelled"],
  sourcing: ["in_progress", "partially_filled", "filled", "on_hold", "cancelled"],
  in_progress: ["sourcing", "partially_filled", "filled", "on_hold", "cancelled"],
  partially_filled: ["in_progress", "filled", "on_hold", "closed", "cancelled"],
  filled: ["partially_filled", "closed"],
  on_hold: ["under_review", "approved", "sourcing", "in_progress", "partially_filled", "cancelled"],
  cancelled: [],
  closed: [],
};

/** Delivery stages that need a prior approval-centre approval (approvedAt). */
export const REQUIREMENT_DELIVERY_STATUSES: readonly RequirementStatus[] = ["approved", "sourcing", "in_progress", "partially_filled", "filled"];

/** Statuses that stamp `closedAt`. */
export const REQUIREMENT_CLOSED_STATUSES: readonly RequirementStatus[] = ["filled", "cancelled", "closed"];

/** Statuses in which the employer may still cancel. */
export const REQUIREMENT_EMPLOYER_CANCELLABLE: readonly RequirementStatus[] = ["draft", "submitted", "under_review", "approved", "sourcing", "in_progress", "on_hold"];

/** Statuses awaiting a decision in the approval centre. */
export const REQUIREMENT_AWAITING_DECISION: readonly RequirementStatus[] = ["submitted", "under_review", "on_hold"];

/** Benefit keys suggested on the requirement form (free text is accepted too). */
export const REQUIREMENT_BENEFIT_OPTIONS = [
  { value: "visa", label: "Visa provided" },
  { value: "air_ticket", label: "Air ticket" },
  { value: "medical_insurance", label: "Medical insurance" },
  { value: "overtime_pay", label: "Overtime pay" },
  { value: "annual_leave", label: "Paid annual leave" },
  { value: "end_of_service", label: "End-of-service benefits" },
] as const;

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export const TICKET_CATEGORY_LABELS = {
  candidate_support: "Candidate support",
  employer_support: "Employer support",
  recruiter_support: "Recruitment partner support",
  training_support: "Training support",
  application_issue: "Application issue",
  documentation_issue: "Documents issue",
  payment_issue: "Payment or billing issue",
  account_issue: "Account or sign-in issue",
  privacy_request: "Privacy request",
  complaint: "Complaint",
  grievance: "Grievance (formal)",
  overseas_employment_issue: "Overseas employment issue",
  other: "Other",
} as const satisfies Record<SupportTicketCategory, string>;

export const TICKET_PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
} as const satisfies Record<SupportTicketPriority, string>;

export const TICKET_STATUS_LABELS = {
  open: "Open",
  pending_staff: "Awaiting support",
  pending_requester: "Awaiting your reply",
  on_hold: "On hold",
  resolved: "Resolved",
  closed: "Closed",
} as const satisfies Record<SupportTicketStatus, string>;

export const TICKET_CHANNEL_LABELS = {
  web: "Web",
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
  walk_in: "Walk-in",
  staff: "Staff",
} as const satisfies Record<SupportTicketChannel, string>;

export const GRIEVANCE_TYPE_LABELS = {
  general: "General grievance",
  content_removal: "Removal of unlawful content",
  impersonation_or_intimate_content: "Impersonation or intimate content",
  personal_data: "Personal data",
  other: "Other",
} as const satisfies Record<GrievanceType, string>;

export const TICKET_CATEGORY_VALUES = keysOf(TICKET_CATEGORY_LABELS);
export const TICKET_PRIORITY_VALUES = keysOf(TICKET_PRIORITY_LABELS);
export const TICKET_STATUS_VALUES = keysOf(TICKET_STATUS_LABELS);
export const TICKET_CHANNEL_VALUES = keysOf(TICKET_CHANNEL_LABELS);
export const GRIEVANCE_TYPE_VALUES = keysOf(GRIEVANCE_TYPE_LABELS);

/** Priorities a requester may pick (urgent is set by staff). */
export const REQUESTER_PRIORITIES: readonly SupportTicketPriority[] = ["low", "normal", "high"];

/** Categories offered to guests on the public help form. */
export const GUEST_TICKET_CATEGORIES: readonly SupportTicketCategory[] = [
  "candidate_support",
  "employer_support",
  "recruiter_support",
  "training_support",
  "account_issue",
  "payment_issue",
  "privacy_request",
  "complaint",
  "grievance",
  "overseas_employment_issue",
  "other",
];

export const OPEN_TICKET_STATUSES: readonly SupportTicketStatus[] = ["open", "pending_staff", "pending_requester", "on_hold"];

export const TICKET_STAFF_TRANSITIONS: Record<SupportTicketStatus, readonly SupportTicketStatus[]> = {
  open: ["pending_staff", "pending_requester", "on_hold", "resolved", "closed"],
  pending_staff: ["pending_requester", "on_hold", "resolved", "closed"],
  pending_requester: ["pending_staff", "on_hold", "resolved", "closed"],
  on_hold: ["pending_staff", "pending_requester", "resolved", "closed"],
  resolved: ["pending_staff", "closed"],
  closed: ["pending_staff"],
};

// ---------------------------------------------------------------------------
// Internal tasks, notes, threads
// ---------------------------------------------------------------------------

export const STAFF_TASK_STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
} as const satisfies Record<StaffTaskStatus, string>;

export const STAFF_TASK_PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
} as const satisfies Record<StaffTaskPriority, string>;

export const STAFF_TASK_STATUS_VALUES = keysOf(STAFF_TASK_STATUS_LABELS);
export const STAFF_TASK_PRIORITY_VALUES = keysOf(STAFF_TASK_PRIORITY_LABELS);

export const STAFF_TASK_TRANSITIONS: Record<StaffTaskStatus, readonly StaffTaskStatus[]> = {
  todo: ["in_progress", "done", "cancelled"],
  in_progress: ["todo", "done", "cancelled"],
  done: ["todo"],
  cancelled: ["todo"],
};

export const NOTE_VISIBILITY_LABELS = {
  staff: "Venkat Sai staff only",
  org_internal: "Organisation team only",
} as const satisfies Record<InternalNoteVisibility, string>;
export const NOTE_VISIBILITY_VALUES = keysOf(NOTE_VISIBILITY_LABELS);

/** Entities notes may be attached to. */
export const NOTE_ENTITY_TYPES = [
  "lead",
  "enquiry",
  "requirement",
  "ticket",
  "task",
  "organization",
  "candidate",
  "application",
  "job",
  "placement",
  "partner_assignment",
  "partner_submission",
  "interview",
  "offer",
] as const;
export type NoteEntityType = (typeof NOTE_ENTITY_TYPES)[number];

/** Entity types an organisation member may keep org-internal notes on (ownership checked by the service). */
export const ORG_NOTE_ENTITY_TYPES: readonly NoteEntityType[] = ["requirement", "job", "application", "candidate", "placement", "partner_assignment", "partner_submission"];

export const THREAD_CONTEXT_LABELS = {
  general: "General",
  requirement: "Workforce requirement",
  partner_assignment: "Partner assignment",
  partner_submission: "Partner submission",
  application: "Application",
  placement: "Placement",
  organization: "Organisation",
} as const satisfies Record<MessageThreadContextType, string>;
export const THREAD_CONTEXT_VALUES = keysOf(THREAD_CONTEXT_LABELS);

export const THREAD_STATUS_LABELS = { open: "Open", closed: "Closed" } as const satisfies Record<MessageThreadStatus, string>;

/** Related-entity types tasks and tickets may point at. */
export const RELATED_ENTITY_TYPES = NOTE_ENTITY_TYPES;

export function canTransition<S extends string>(map: Record<S, readonly S[]>, from: S, to: S): boolean {
  return from !== to && (map[from] ?? []).includes(to);
}
