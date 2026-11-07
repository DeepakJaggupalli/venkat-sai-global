/**
 * Domain schema: operations — CRM (leads, enquiries), workforce requirement requests,
 * the helpdesk (support tickets incl. grievances), internal staff tasks and notes, and
 * message threads between Venkat Sai staff and organisations / candidates.
 *
 * Layer 9 — may import from: taxonomy, core, identity, organizations, system, employers, partners, candidates.
 * Never import from a later layer (see docs/DATA_MODEL.md → Layering).
 *
 * Privacy: every table here holds personal data of prospects, requesters or staff. Staff-only
 * fields (`internalNotes`, `internal_notes` rows with visibility "staff", ticket messages with
 * `isInternal`) must never be returned to candidates, employers or partners.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { PORTALS, SALARY_PERIODS } from "./_constants";
import { countryCode, createdAtOnly, currencyCode, emptyJsonObject, moneyMinor, pk, timestamps, tstz, tsvector } from "./_shared";
import { organizations, users } from "./core";
import { approvalRequests, dataRequests } from "./system";
import { countries, currencies, industries, jobCategories } from "./taxonomy";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

// ---------------------------------------------------------------------------
// Leads (CRM pipeline)
// ---------------------------------------------------------------------------

export const LEAD_TYPES = ["employer", "partner", "institution", "candidate", "other"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_SOURCES = [
  "website_form",
  "requirement_form",
  "referral",
  "event",
  "phone",
  "whatsapp",
  "email",
  "walk_in",
  "import",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost", "nurturing"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Campaign attribution captured with a lead. Non-personal: the referrer is stored as a domain only. */
export type LeadAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPath?: string;
  referrerDomain?: string;
};

/**
 * Sales / partnership pipeline for prospective employers, recruitment partners, institutions
 * and candidates. Created by staff or from public forms (enquiries, requirement form).
 * Personal data of prospects: use it only for the stated interest; the privacy module purges or
 * anonymises lost / stale leads after the retention period. Visible only in the Command Centre
 * (leads.view / leads.manage).
 */
export const leads = pgTable(
  "leads",
  {
    id: pk(),
    /** VSG-LEAD-000123 — nextCode("LEAD"). */
    code: text().notNull(),
    type: text({ enum: LEAD_TYPES }).notNull(),
    source: text({ enum: LEAD_SOURCES }).notNull(),
    /** Detail for the source: event name, referrer, import batch... */
    sourceDetail: text(),
    status: text({ enum: LEAD_STATUSES }).notNull().default("new"),
    /** Contact person. */
    name: text().notNull(),
    designation: text(),
    organizationName: text(),
    /** Lower-cased, trimmed. */
    email: text(),
    /** E.164 (+919876543210). */
    phone: text(),
    countryCode: countryCode().references(() => countries.code),
    city: text(),
    /** What the prospect is interested in (services, roles, destinations, training...). */
    interest: text(),
    /** Staff working notes (internal only). */
    notes: text(),
    /** Optional pipeline value estimate — amount + currency, never an assumed currency. */
    estimatedValueMinor: moneyMinor(),
    estimatedValueCurrency: currencyCode().references(() => currencies.code),
    /** The prospect asked or agreed to be contacted (public forms record it explicitly). */
    consentToContact: boolean().notNull().default(false),
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Set when the lead converts into a platform organisation. */
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    convertedAt: tstz(),
    utm: jsonb().$type<LeadAttribution>().notNull().default(emptyJsonObject),
    lastContactedAt: tstz(),
    nextFollowUpAt: tstz(),
    lostReason: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("leads_code_uq").on(t.code),
    index("leads_status_idx").on(t.status, t.createdAt),
    index("leads_assignee_idx").on(t.assignedToUserId, t.status),
    index("leads_follow_up_idx").on(t.nextFollowUpAt).where(sql`${t.status} not in ('won', 'lost')`),
    index("leads_org_idx").on(t.organizationId),
    index("leads_country_idx").on(t.countryCode),
    index("leads_currency_idx").on(t.estimatedValueCurrency),
    index("leads_created_by_idx").on(t.createdByUserId),
    index("leads_email_idx").on(t.email),
    index("leads_phone_idx").on(t.phone),
    // Operator class via .op(): an SQL expression here makes drizzle-kit push re-create the index every run.
    index("leads_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
    index("leads_org_name_trgm_idx").using("gin", t.organizationName.op("gin_trgm_ops")),
    check(
      "leads_estimated_value_chk",
      sql`(${t.estimatedValueMinor} is null) = (${t.estimatedValueCurrency} is null) and coalesce(${t.estimatedValueMinor}, 0) >= 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Workforce requirement requests (bulk manpower / project / individual hiring)
// ---------------------------------------------------------------------------

export const REQUIREMENT_KINDS = ["individual", "bulk", "project", "temporary", "contract", "internship", "training", "campus"] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

/** `draft` = saved in the Employer Portal but not yet submitted. */
export const REQUIREMENT_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "sourcing",
  "in_progress",
  "partially_filled",
  "filled",
  "on_hold",
  "cancelled",
  "closed",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_URGENCIES = ["low", "normal", "high", "critical"] as const;
export type RequirementUrgency = (typeof REQUIREMENT_URGENCIES)[number];

export const REQUIREMENT_INTERVIEW_METHODS = ["in_person", "video", "phone", "trade_test", "mixed"] as const;
export type RequirementInterviewMethod = (typeof REQUIREMENT_INTERVIEW_METHODS)[number];

export const REQUIREMENT_SOURCES = ["public_form", "employer_portal", "staff_entry", "email", "phone", "import"] as const;
export type RequirementSource = (typeof REQUIREMENT_SOURCES)[number];

/**
 * Workforce requirement — the bulk / project manpower request form (one header + one
 * requirement_lines row per trade or role). Public submissions arrive without an organisation
 * (organizationId null, company and contact details typed into the form); employer submissions
 * carry their organisation. Processed by Venkat Sai staff (requirements.manage) through the
 * approval inbox (approval type "requirement_request").
 * Privacy: contact details are business contact data; `internalNotes` and the quotation are
 * staff-controlled — `internalNotes` is never shown to the employer.
 */
export const requirementRequests = pgTable(
  "requirement_requests",
  {
    id: pk(),
    /** VSG-REQ-000123 — nextCode("REQ"). */
    code: text().notNull(),
    /** Null for public submissions (no account / organisation yet). */
    organizationId: uuid().references(() => organizations.id),
    leadId: uuid().references(() => leads.id, { onDelete: "set null" }),
    submittedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    source: text({ enum: REQUIREMENT_SOURCES }).notNull(),
    kind: text({ enum: REQUIREMENT_KINDS }).notNull().default("bulk"),
    title: text().notNull(),
    description: text(),

    // Requesting company & contact (as entered; a snapshot for organisation submissions).
    organizationName: text(),
    contactName: text().notNull(),
    contactDesignation: text(),
    /** Lower-cased, trimmed. */
    contactEmail: text(),
    /** E.164. */
    contactPhone: text(),
    /** Public form: the requester agreed to be contacted about this requirement. */
    consentToContact: boolean().notNull().default(false),
    /** Version of the privacy notice shown on the form (CMS legal page version). */
    privacyNoticeVersion: text(),

    // Work details.
    /** Country of employment. */
    countryCode: countryCode().references(() => countries.code),
    /** Work sites / cities (free text, may list several). */
    locations: text(),
    industryId: uuid().references(() => industries.id, { onDelete: "set null" }),
    totalPositions: integer().notNull(),
    contractDurationMonths: integer(),
    /** e.g. "8 hours/day, 6 days/week, overtime as per local labour law". */
    workingHours: text(),
    /** Required joining / mobilisation date (calendar date, 'YYYY-MM-DD'). */
    joiningBy: date({ mode: "string" }),
    interviewMethod: text({ enum: REQUIREMENT_INTERVIEW_METHODS }),
    /** Preferred interview / trade-test dates and venue. */
    interviewDetails: text(),
    assessmentRequired: boolean().notNull().default(false),
    /** e.g. "Practical welding test, 6G position" — free text, never implies an external certification. */
    assessmentDetails: text(),
    documentationRequirements: text(),
    languageRequirements: text(),
    /** Benefit keys / labels offered (visa, air_ticket, medical_insurance, overtime_pay, annual_leave...). */
    benefits: text().array().notNull().$defaultFn(() => []),
    accommodationProvided: boolean().notNull().default(false),
    foodProvided: boolean().notNull().default(false),
    transportProvided: boolean().notNull().default(false),
    urgency: text({ enum: REQUIREMENT_URGENCIES }).notNull().default("normal"),
    /** Supporting documents (demand letter, job descriptions). Soft references to files.id. */
    attachmentFileIds: uuid().array().notNull().$defaultFn(() => []),

    // Processing (Venkat Sai).
    status: text({ enum: REQUIREMENT_STATUSES }).notNull().default("submitted"),
    /** Reason shown with on_hold / cancelled / closed. */
    statusReason: text(),
    /** Venkat Sai owner of the requirement. */
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    approvalRequestId: uuid(),
    /** Optional quotation — amount + currency. */
    quotedFeeMinor: moneyMinor(),
    quotedFeeCurrency: currencyCode().references(() => currencies.code),
    /** Staff only. Never shown to the employer or partners. */
    internalNotes: text(),
    /** HMAC of the submitter IP (abuse prevention for public submissions). */
    ipHash: text(),
    submittedAt: tstz(),
    approvedAt: tstz(),
    /** Set when the request reaches a terminal status (filled, cancelled, closed). */
    closedAt: tstz(),
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple'::regconfig, coalesce(${requirementRequests.code}, '') || ' ' || coalesce(${requirementRequests.title}, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(${requirementRequests.organizationName}, '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce(${requirementRequests.locations}, '')), 'C') || setweight(to_tsvector('simple'::regconfig, coalesce(${requirementRequests.description}, '')), 'D')`,
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("requirement_requests_code_uq").on(t.code),
    index("requirement_requests_org_idx").on(t.organizationId, t.createdAt),
    index("requirement_requests_lead_idx").on(t.leadId),
    index("requirement_requests_submitted_by_idx").on(t.submittedByUserId),
    index("requirement_requests_status_idx").on(t.status, t.createdAt),
    index("requirement_requests_assignee_idx").on(t.assignedToUserId, t.status),
    index("requirement_requests_country_idx").on(t.countryCode),
    index("requirement_requests_industry_idx").on(t.industryId),
    index("requirement_requests_approval_idx").on(t.approvalRequestId),
    index("requirement_requests_currency_idx").on(t.quotedFeeCurrency),
    index("requirement_requests_search_idx").using("gin", t.searchVector),
    // Explicit name: the generated one exceeds PostgreSQL's 63-character identifier limit.
    foreignKey({ name: "requirement_requests_approval_request_fk", columns: [t.approvalRequestId], foreignColumns: [approvalRequests.id] }).onDelete(
      "set null",
    ),
    check("requirement_requests_positions_chk", sql`${t.totalPositions} > 0`),
    check("requirement_requests_duration_chk", sql`${t.contractDurationMonths} is null or ${t.contractDurationMonths} > 0`),
    check(
      "requirement_requests_quote_chk",
      sql`(${t.quotedFeeMinor} is null) = (${t.quotedFeeCurrency} is null) and coalesce(${t.quotedFeeMinor}, 0) >= 0`,
    ),
    check("requirement_requests_submitted_chk", sql`${t.status} = 'draft' or ${t.submittedAt} is not null`),
  ],
);

/**
 * One trade / role within a requirement request (e.g. "TIG welder × 20", "Pipe fitter × 10").
 * Salary is an amount range + currency + period; no currency is ever assumed.
 */
export const requirementLines = pgTable(
  "requirement_lines",
  {
    id: pk(),
    requirementId: uuid()
      .notNull()
      .references(() => requirementRequests.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull().default(0),
    jobCategoryId: uuid().references(() => jobCategories.id, { onDelete: "set null" }),
    roleTitle: text().notNull(),
    positions: integer().notNull(),
    experienceMinYears: integer(),
    experienceMaxYears: integer(),
    qualification: text(),
    /** Skill names as entered on the form (mapped to skills taxonomy when the job is created). */
    requiredSkills: text().array().notNull().$defaultFn(() => []),
    salaryMinMinor: moneyMinor(),
    salaryMaxMinor: moneyMinor(),
    salaryCurrency: currencyCode().references(() => currencies.code),
    salaryPeriod: text({ enum: SALARY_PERIODS }),
    /** Role-specific requirements (certifications, positions, tools...). */
    notes: text(),
    filledCount: integer().notNull().default(0),
    /** Soft reference → jobs.id (jobs is a later layer): the posting created for this line. */
    jobId: uuid(),
    ...timestamps,
  },
  (t) => [
    index("requirement_lines_requirement_idx").on(t.requirementId, t.sortOrder),
    index("requirement_lines_category_idx").on(t.jobCategoryId),
    index("requirement_lines_currency_idx").on(t.salaryCurrency),
    index("requirement_lines_job_idx").on(t.jobId),
    check("requirement_lines_positions_chk", sql`${t.positions} > 0`),
    check("requirement_lines_filled_chk", sql`${t.filledCount} >= 0`),
    check(
      "requirement_lines_experience_chk",
      sql`coalesce(${t.experienceMinYears}, 0) >= 0 and (${t.experienceMaxYears} is null or ${t.experienceMaxYears} >= coalesce(${t.experienceMinYears}, 0))`,
    ),
    check(
      "requirement_lines_salary_chk",
      sql`coalesce(${t.salaryMinMinor}, 0) >= 0 and coalesce(${t.salaryMaxMinor}, 0) >= 0 and (${t.salaryMinMinor} is null or ${t.salaryMaxMinor} is null or ${t.salaryMinMinor} <= ${t.salaryMaxMinor}) and ((${t.salaryMinMinor} is null and ${t.salaryMaxMinor} is null) or (${t.salaryCurrency} is not null and ${t.salaryPeriod} is not null))`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Helpdesk: support tickets, grievances
// ---------------------------------------------------------------------------

export const SUPPORT_TICKET_CATEGORIES = [
  "candidate_support",
  "employer_support",
  "recruiter_support",
  "training_support",
  "application_issue",
  "documentation_issue",
  "payment_issue",
  "account_issue",
  "privacy_request",
  "complaint",
  "grievance",
  "overseas_employment_issue",
  "other",
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_STATUSES = ["open", "pending_staff", "pending_requester", "on_hold", "resolved", "closed"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

/** How the ticket reached Venkat Sai. */
export const SUPPORT_TICKET_CHANNELS = ["web", "email", "phone", "whatsapp", "walk_in", "staff"] as const;
export type SupportTicketChannel = (typeof SUPPORT_TICKET_CHANNELS)[number];

/**
 * Grievance kinds — each maps to a resolution timeline configured in settings (IT Rules 2021 as
 * amended in 2022: acknowledge within 24 hours, resolve within 15 days; requests to remove unlawful
 * content within 72 hours; impersonation / intimate-content complaints within 24 hours).
 */
export const GRIEVANCE_TYPES = ["general", "content_removal", "impersonation_or_intimate_content", "personal_data", "other"] as const;
export type GrievanceType = (typeof GRIEVANCE_TYPES)[number];

/**
 * Helpdesk tickets from every portal and from guests, including formal grievances.
 *  - SLA: `firstResponseDueAt` / `resolutionDueAt` are set from settings (support.sla_hours_* by
 *    priority; for grievances privacy.grievance_ack_hours / grievance_resolution_days or the
 *    shorter statutory timeline of the grievance type). The support.sla_watch task stamps
 *    `slaBreachedAt` and escalates.
 *  - Grievances (`isGrievance`) get their own register number (`grievanceCode`, VSG-GRV-…) and are
 *    handled by staff with support.grievances.
 *  - The conversation lives in ticket_messages; staff-only notes there have `isInternal`.
 * Privacy: requester contact details are personal data; tickets are retained per the support
 * retention policy and anonymised on account deletion where no legal hold applies.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: pk(),
    /** VSG-TKT-000123 — nextCode("TKT"). */
    code: text().notNull(),
    /** VSG-GRV-000045 — nextCode("GRV"); set only for grievances. */
    grievanceCode: text(),
    requesterUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Snapshot for signed-in requesters; the only identity for guests. */
    requesterName: text(),
    /** Lower-cased, trimmed. */
    requesterEmail: text(),
    /** E.164. */
    requesterPhone: text(),
    /** Organisation the request is raised for (employer / partner / institution workspace). */
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    portal: text({ enum: PORTALS }).notNull().default("public"),
    channel: text({ enum: SUPPORT_TICKET_CHANNELS }).notNull().default("web"),
    category: text({ enum: SUPPORT_TICKET_CATEGORIES }).notNull(),
    priority: text({ enum: SUPPORT_TICKET_PRIORITIES }).notNull().default("normal"),
    status: text({ enum: SUPPORT_TICKET_STATUSES }).notNull().default("open"),
    /** Last status change (drives auto-close of pending_requester tickets). */
    statusChangedAt: tstz().notNull().defaultNow(),
    subject: text().notNull(),
    tags: text().array().notNull().$defaultFn(() => []),
    /** Requester's language for replies (People Portal is multilingual). */
    locale: text(),
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** What the ticket is about: application, job, invoice, payment, placement, requirement, enrolment... */
    relatedType: text(),
    /** Soft reference to the related entity (may live in a later layer). */
    relatedId: uuid(),
    /** Privacy requests are processed through the data-subject request workflow. */
    dataRequestId: uuid().references(() => dataRequests.id, { onDelete: "set null" }),

    // SLA
    firstResponseDueAt: tstz(),
    firstRespondedAt: tstz(),
    resolutionDueAt: tstz(),
    resolvedAt: tstz(),
    closedAt: tstz(),
    /** First time a deadline was missed (set once by support.sla_watch). */
    slaBreachedAt: tstz(),
    escalationLevel: integer().notNull().default(0),
    escalatedAt: tstz(),

    // Grievance handling (IT Rules 2021)
    isGrievance: boolean().notNull().default(false),
    grievanceType: text({ enum: GRIEVANCE_TYPES }),

    /** Resolution summary shared with the requester. */
    resolution: text(),
    /** 1–5, given by the requester after resolution. */
    satisfactionRating: smallint(),
    satisfactionComment: text(),
    lastMessageAt: tstz(),
    /** HMAC of the submitter IP (guest submissions, abuse prevention). */
    ipHash: text(),
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple'::regconfig, coalesce(${supportTickets.code}, '') || ' ' || coalesce(${supportTickets.grievanceCode}, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(${supportTickets.subject}, '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce(${supportTickets.requesterName}, '')), 'C')`,
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("support_tickets_code_uq").on(t.code),
    uniqueIndex("support_tickets_grievance_code_uq").on(t.grievanceCode),
    index("support_tickets_requester_idx").on(t.requesterUserId, t.createdAt),
    index("support_tickets_requester_email_idx").on(t.requesterEmail),
    index("support_tickets_org_idx").on(t.organizationId, t.createdAt),
    index("support_tickets_status_idx").on(t.status, t.priority, t.createdAt),
    index("support_tickets_assignee_idx").on(t.assignedToUserId, t.status),
    index("support_tickets_category_idx").on(t.category, t.status),
    index("support_tickets_related_idx").on(t.relatedType, t.relatedId),
    index("support_tickets_data_request_idx").on(t.dataRequestId),
    index("support_tickets_first_response_due_idx").on(t.firstResponseDueAt).where(sql`${t.firstRespondedAt} is null`),
    index("support_tickets_resolution_due_idx").on(t.resolutionDueAt).where(sql`${t.resolvedAt} is null`),
    index("support_tickets_grievance_idx").on(t.createdAt).where(sql`${t.isGrievance}`),
    index("support_tickets_search_idx").using("gin", t.searchVector),
    check("support_tickets_rating_chk", sql`${t.satisfactionRating} is null or ${t.satisfactionRating} between 1 and 5`),
    check("support_tickets_escalation_chk", sql`${t.escalationLevel} >= 0`),
    check(
      "support_tickets_grievance_chk",
      sql`${t.isGrievance} = (${t.grievanceType} is not null) and (${t.grievanceCode} is null or ${t.isGrievance}) and (${t.category} <> 'grievance' or ${t.isGrievance})`,
    ),
  ],
);

export const TICKET_MESSAGE_AUTHOR_TYPES = ["requester", "staff", "system"] as const;
export type TicketMessageAuthorType = (typeof TICKET_MESSAGE_AUTHOR_TYPES)[number];

/**
 * Conversation on a ticket. Append-only (no edits). `isInternal` messages are staff-only notes and
 * must never be shown to the requester. Attachments go through the files module (purpose
 * ticket_attachment) and are access-checked there.
 */
export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: pk(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    authorType: text({ enum: TICKET_MESSAGE_AUTHOR_TYPES }).notNull(),
    /** Display-name snapshot (guests, deleted accounts). */
    authorName: text(),
    /** Plain text. */
    body: text().notNull(),
    isInternal: boolean().notNull().default(false),
    /** Soft references to files.id (purpose ticket_attachment). */
    attachmentFileIds: uuid().array().notNull().$defaultFn(() => []),
    ...createdAtOnly,
  },
  (t) => [
    index("ticket_messages_ticket_idx").on(t.ticketId, t.createdAt),
    index("ticket_messages_author_idx").on(t.authorUserId),
    check("ticket_messages_internal_chk", sql`not (${t.isInternal} and ${t.authorType} = 'requester')`),
  ],
);

// ---------------------------------------------------------------------------
// Enquiries (public contact forms)
// ---------------------------------------------------------------------------

export const ENQUIRY_TYPES = ["general", "employer", "partner", "institution", "candidate_support", "media", "grievance", "careers"] as const;
export type EnquiryType = (typeof ENQUIRY_TYPES)[number];

export const ENQUIRY_STATUSES = ["new", "in_progress", "responded", "closed", "spam"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/**
 * Messages from the public contact forms (and staff-logged calls). Business enquiries may become
 * leads (`leadId`); grievances and support needs are converted into support tickets
 * (`supportTicketId`) so they get SLA tracking. Personal data supplied voluntarily for a reply:
 * retained per the enquiry retention policy; `ipHash` only (never the raw IP).
 */
export const enquiries = pgTable(
  "enquiries",
  {
    id: pk(),
    /** VSG-ENQ-000123 — nextCode("ENQ"). */
    code: text().notNull(),
    type: text({ enum: ENQUIRY_TYPES }).notNull().default("general"),
    name: text().notNull(),
    /** Lower-cased, trimmed. */
    email: text(),
    /** E.164. */
    phone: text(),
    organizationName: text(),
    subject: text(),
    message: text().notNull(),
    status: text({ enum: ENQUIRY_STATUSES }).notNull().default("new"),
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    leadId: uuid().references(() => leads.id, { onDelete: "set null" }),
    /** Set when the visitor was signed in. */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    supportTicketId: uuid().references(() => supportTickets.id, { onDelete: "set null" }),
    consentToContact: boolean().notNull().default(false),
    /** Version of the privacy notice shown on the form. */
    privacyNoticeVersion: text(),
    /** UI language of the form, used for the reply. */
    locale: text(),
    /** Path of the page the form was submitted from. */
    sourcePage: text(),
    ipHash: text(),
    respondedAt: tstz(),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("enquiries_code_uq").on(t.code),
    index("enquiries_status_idx").on(t.status, t.createdAt),
    index("enquiries_type_idx").on(t.type, t.status),
    index("enquiries_assignee_idx").on(t.assignedToUserId, t.status),
    index("enquiries_lead_idx").on(t.leadId),
    index("enquiries_user_idx").on(t.userId),
    index("enquiries_ticket_idx").on(t.supportTicketId),
    index("enquiries_email_idx").on(t.email),
    check("enquiries_contact_chk", sql`${t.email} is not null or ${t.phone} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Internal staff tasks & notes
// ---------------------------------------------------------------------------

export const STAFF_TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;
export type StaffTaskStatus = (typeof STAFF_TASK_STATUSES)[number];

export const STAFF_TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type StaffTaskPriority = (typeof STAFF_TASK_PRIORITIES)[number];

/**
 * Internal to-dos for Venkat Sai staff (follow up a lead, verify documents, call an employer...),
 * optionally linked to any entity. Command Centre only.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    title: text().notNull(),
    description: text(),
    status: text({ enum: STAFF_TASK_STATUSES }).notNull().default("todo"),
    priority: text({ enum: STAFF_TASK_PRIORITIES }).notNull().default("normal"),
    dueAt: tstz(),
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Organisation the task concerns (for org timelines). */
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    /** lead, enquiry, requirement, application, candidate, ticket, placement... */
    relatedType: text(),
    /** Soft reference to the related entity (may live in a later layer). */
    relatedId: uuid(),
    completedAt: tstz(),
    completedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Due-date reminder sent (keeps the reminder task idempotent). */
    reminderSentAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assignedToUserId, t.status, t.dueAt),
    index("tasks_status_due_idx").on(t.status, t.dueAt),
    index("tasks_created_by_idx").on(t.createdByUserId),
    index("tasks_completed_by_idx").on(t.completedByUserId),
    index("tasks_org_idx").on(t.organizationId),
    index("tasks_related_idx").on(t.relatedType, t.relatedId),
    check("tasks_completed_chk", sql`${t.status} <> 'done' or ${t.completedAt} is not null`),
  ],
);

export const INTERNAL_NOTE_VISIBILITIES = ["staff", "org_internal"] as const;
export type InternalNoteVisibility = (typeof INTERNAL_NOTE_VISIBILITIES)[number];

/**
 * Notes on any entity (candidate, organisation, requirement, application...).
 *  - visibility "staff": Venkat Sai staff only.
 *  - visibility "org_internal": members of `organizationId` (and staff) — e.g. an employer's private
 *    notes. Never visible to candidates or to other organisations.
 */
export const internalNotes = pgTable(
  "internal_notes",
  {
    id: pk(),
    entityType: text().notNull(),
    /** Soft reference to the noted entity (may live in a later layer). */
    entityId: uuid().notNull(),
    /** Scope organisation: required for org_internal notes. */
    organizationId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    body: text().notNull(),
    visibility: text({ enum: INTERNAL_NOTE_VISIBILITIES }).notNull().default("staff"),
    pinned: boolean().notNull().default(false),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("internal_notes_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("internal_notes_org_idx").on(t.organizationId),
    index("internal_notes_author_idx").on(t.authorUserId),
    check("internal_notes_scope_chk", sql`${t.visibility} <> 'org_internal' or ${t.organizationId} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Message threads (staff ↔ organisation / candidate conversations)
// ---------------------------------------------------------------------------

export const MESSAGE_THREAD_CONTEXT_TYPES = [
  "general",
  "requirement",
  "partner_assignment",
  "partner_submission",
  "application",
  "placement",
  "organization",
] as const;
export type MessageThreadContextType = (typeof MESSAGE_THREAD_CONTEXT_TYPES)[number];

export const MESSAGE_THREAD_STATUSES = ["open", "closed"] as const;
export type MessageThreadStatus = (typeof MESSAGE_THREAD_STATUSES)[number];

/**
 * A conversation between Venkat Sai staff and an organisation's members (employer, partner,
 * institution) or a candidate, optionally about a requirement, submission, application or
 * placement. Only participants (message_thread_participants) and authorised staff may read it.
 */
export const messageThreads = pgTable(
  "message_threads",
  {
    id: pk(),
    subject: text().notNull(),
    contextType: text({ enum: MESSAGE_THREAD_CONTEXT_TYPES }).notNull().default("general"),
    /** Soft reference to the context entity (may live in a later layer). */
    contextId: uuid(),
    /** Counterpart organisation (null for candidate ↔ staff threads). */
    organizationId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    status: text({ enum: MESSAGE_THREAD_STATUSES }).notNull().default("open"),
    lastMessageAt: tstz(),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("message_threads_org_idx").on(t.organizationId, t.lastMessageAt),
    index("message_threads_context_idx").on(t.contextType, t.contextId),
    index("message_threads_created_by_idx").on(t.createdByUserId),
    index("message_threads_status_idx").on(t.status, t.lastMessageAt),
    check("message_threads_context_chk", sql`${t.contextType} = 'general' or ${t.contextId} is not null`),
  ],
);

/** Who can read / post in a thread, and their read position (unread = messages after lastReadAt). */
export const messageThreadParticipants = pgTable(
  "message_thread_participants",
  {
    threadId: uuid()
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Capacity in which the user participates (their organisation); null = staff or candidate. */
    organizationId: uuid(),
    lastReadAt: tstz(),
    isMuted: boolean().notNull().default(false),
    /** Removed from the thread (keeps history of who had access). */
    removedAt: tstz(),
    ...createdAtOnly,
  },
  (t) => [
    primaryKey({ name: "message_thread_participants_pk", columns: [t.threadId, t.userId] }),
    index("message_thread_participants_user_idx").on(t.userId),
    index("message_thread_participants_org_idx").on(t.organizationId),
    // Explicit name keeps the identifier well inside PostgreSQL's 63-character limit.
    foreignKey({ name: "message_thread_participants_org_fk", columns: [t.organizationId], foreignColumns: [organizations.id] }).onDelete("set null"),
  ],
);

/**
 * Messages in a thread. Append-only; moderation hides a message with `deletedAt` (shown as
 * "message removed"). Attachments go through the files module (purpose message_attachment).
 */
export const messages = pgTable(
  "messages",
  {
    id: pk(),
    threadId: uuid()
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** System-generated event message (status change, assignment...). */
    isSystem: boolean().notNull().default(false),
    /** Plain text. */
    body: text().notNull(),
    /** Soft references to files.id (purpose message_attachment). */
    attachmentFileIds: uuid().array().notNull().$defaultFn(() => []),
    deletedAt: tstz(),
    ...createdAtOnly,
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt), index("messages_author_idx").on(t.authorUserId)],
);
