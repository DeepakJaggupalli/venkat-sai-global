/**
 * Zod schemas for operations forms and actions (client-safe; FormData-friendly via `f` builders).
 * Public forms carry a honeypot field `website` (hidden from people, filled by bots) — the service
 * silently drops such submissions — and require explicit consent to be contacted.
 */
import { z } from "zod";

import { SALARY_PERIODS } from "@/db/schema/_constants";
import { f } from "@/lib/validation";

import {
  ENQUIRY_STATUS_VALUES,
  ENQUIRY_TYPE_VALUES,
  GRIEVANCE_TYPE_VALUES,
  LEAD_SOURCE_VALUES,
  LEAD_STATUS_VALUES,
  LEAD_TYPE_VALUES,
  NOTE_ENTITY_TYPES,
  NOTE_VISIBILITY_VALUES,
  RELATED_ENTITY_TYPES,
  REQUIREMENT_INTERVIEW_METHOD_VALUES,
  REQUIREMENT_KIND_VALUES,
  REQUIREMENT_STATUS_VALUES,
  REQUIREMENT_URGENCY_VALUES,
  STAFF_TASK_PRIORITY_VALUES,
  STAFF_TASK_STATUS_VALUES,
  THREAD_CONTEXT_VALUES,
  TICKET_CATEGORY_VALUES,
  TICKET_CHANNEL_VALUES,
  TICKET_PRIORITY_VALUES,
  TICKET_STATUS_VALUES,
} from "./constants";

const PORTAL_VALUES = ["public", "talent", "employer", "recruiter", "institution", "admin"] as const;

/** Checkbox that must be ticked. */
const mustAgree = (message: string) => f.bool().refine((v) => v === true, { message });

/** Hidden honeypot input: accepted (never a validation error, so bots learn nothing); the service checks it. */
const honeypot = z.string().max(500).optional();

/** Relative path of the page a public form was sent from. */
const sourcePath = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v && v.startsWith("/") && !v.startsWith("//") ? v : undefined));

const utm = z
  .object({
    source: z.string().trim().max(120).optional(),
    medium: z.string().trim().max(120).optional(),
    campaign: z.string().trim().max(200).optional(),
    term: z.string().trim().max(200).optional(),
    content: z.string().trim().max(200).optional(),
  })
  .partial()
  .optional();

const locale = z
  .string()
  .trim()
  .max(12)
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/)
  .optional()
  .catch(undefined);

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time" });
      return z.NEVER;
    }
    return d;
  });

const nullableUuid = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid("Invalid identifier").nullable());

// ---------------------------------------------------------------------------
// Enquiries (public contact form)
// ---------------------------------------------------------------------------

export const publicEnquirySchema = z
  .object({
    type: f.enumOf(ENQUIRY_TYPE_VALUES).default("general"),
    name: f.text({ label: "Your name", max: 120 }),
    email: f.optionalEmail(),
    phone: f.optionalPhone(),
    organizationName: f.optionalText(200),
    subject: f.optionalText(200),
    message: f.text({ label: "Your message", min: 10, max: 5000 }),
    consentToContact: mustAgree("Please agree that we may contact you about your enquiry"),
    website: honeypot,
    sourcePage: sourcePath,
    locale,
    utm,
  })
  .refine((v) => Boolean(v.email || v.phone), { path: ["email"], message: "Enter an email address or a phone number so we can reply" });
export type PublicEnquiryInput = z.output<typeof publicEnquirySchema>;

export const enquiryStatusSchema = z.object({ id: f.uuid(), status: f.enumOf(ENQUIRY_STATUS_VALUES), note: f.longText(2000) });
export const enquiryRespondSchema = z.object({ id: f.uuid(), note: f.text({ label: "Response summary", max: 5000 }) });
export const enquiryLinkLeadSchema = z.object({ id: f.uuid(), leadId: nullableUuid });

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

const leadFields = {
  type: f.enumOf(LEAD_TYPE_VALUES),
  source: f.enumOf(LEAD_SOURCE_VALUES),
  sourceDetail: f.optionalText(200),
  name: f.text({ label: "Contact name", max: 120 }),
  designation: f.optionalText(120),
  organizationName: f.optionalText(200),
  email: f.optionalEmail(),
  phone: f.optionalPhone(),
  countryCode: f.countryCode().optional(),
  city: f.optionalText(120),
  interest: f.longText(2000),
  notes: f.longText(5000),
  estimatedValue: f.optionalAmount(),
  estimatedValueCurrency: f.currencyCode().optional(),
  consentToContact: f.bool(),
  nextFollowUpAt: optionalDateTime,
};

const leadMoneyRefine = (v: { estimatedValue?: number; estimatedValueCurrency?: string }) => (v.estimatedValue === undefined) === (v.estimatedValueCurrency === undefined);

export const leadCreateSchema = z.object(leadFields).refine(leadMoneyRefine, { path: ["estimatedValueCurrency"], message: "Enter both an amount and its currency" });
export type LeadCreateInput = z.output<typeof leadCreateSchema>;

export const leadUpdateSchema = z
  .object({ id: f.uuid(), ...leadFields })
  .partial({ type: true, source: true, name: true })
  .refine(leadMoneyRefine, { path: ["estimatedValueCurrency"], message: "Enter both an amount and its currency" });
export type LeadUpdateInput = z.output<typeof leadUpdateSchema>;

export const leadStatusSchema = z
  .object({ id: f.uuid(), status: f.enumOf(LEAD_STATUS_VALUES), lostReason: f.optionalText(500) })
  .refine((v) => v.status !== "lost" || Boolean(v.lostReason), { path: ["lostReason"], message: "Say why the lead was lost" });

export const leadFollowUpSchema = z.object({
  id: f.uuid(),
  note: f.longText(5000),
  contactedAt: optionalDateTime,
  nextFollowUpAt: optionalDateTime,
});

export const leadConvertSchema = z.object({ id: f.uuid(), organizationId: f.uuid() });

/** Assign / unassign any operations record to a staff member. */
export const assignSchema = z.object({ id: f.uuid(), assigneeUserId: nullableUuid });

// ---------------------------------------------------------------------------
// Workforce requirements
// ---------------------------------------------------------------------------

export const requirementLineSchema = z
  .object({
    id: f.optionalUuid(),
    jobCategoryId: f.optionalUuid(),
    roleTitle: f.text({ label: "Role", max: 160 }),
    positions: f.int({ min: 1, max: 100_000 }),
    experienceMinYears: f.optionalInt({ min: 0, max: 60 }),
    experienceMaxYears: f.optionalInt({ min: 0, max: 60 }),
    qualification: f.optionalText(300),
    requiredSkills: f.stringArray().pipe(z.array(z.string().max(80)).max(30, "Up to 30 skills")),
    salaryMin: f.optionalAmount(),
    salaryMax: f.optionalAmount(),
    salaryCurrency: f.currencyCode().optional(),
    salaryPeriod: f.enumOf(SALARY_PERIODS).optional(),
    notes: f.longText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.experienceMinYears !== undefined && v.experienceMaxYears !== undefined && v.experienceMaxYears < v.experienceMinYears) {
      ctx.addIssue({ code: "custom", path: ["experienceMaxYears"], message: "Maximum experience must be at least the minimum" });
    }
    const hasSalary = v.salaryMin !== undefined || v.salaryMax !== undefined;
    if (hasSalary && (!v.salaryCurrency || !v.salaryPeriod)) {
      ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "Choose the salary currency and period" });
    }
    if (v.salaryMin !== undefined && v.salaryMax !== undefined && v.salaryMin > v.salaryMax) {
      ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "Maximum salary must be at least the minimum" });
    }
  });
export type RequirementLineInput = z.output<typeof requirementLineSchema>;

const requirementWorkFields = {
  kind: f.enumOf(REQUIREMENT_KIND_VALUES).default("bulk"),
  title: f.text({ label: "Requirement title", max: 200 }),
  description: f.longText(10_000),
  countryCode: f.countryCode().optional(),
  locations: f.optionalText(500),
  industryId: f.optionalUuid(),
  contractDurationMonths: f.optionalInt({ min: 1, max: 600 }),
  workingHours: f.optionalText(300),
  joiningBy: f.optionalDate().transform((d) => (d ? d.toISOString().slice(0, 10) : undefined)),
  interviewMethod: f.enumOf(REQUIREMENT_INTERVIEW_METHOD_VALUES).optional(),
  interviewDetails: f.longText(2000),
  assessmentRequired: f.bool(),
  assessmentDetails: f.longText(2000),
  documentationRequirements: f.longText(2000),
  languageRequirements: f.optionalText(500),
  benefits: f.stringArray().pipe(z.array(z.string().max(80)).max(20)),
  accommodationProvided: f.bool(),
  foodProvided: f.bool(),
  transportProvided: f.bool(),
  urgency: f.enumOf(REQUIREMENT_URGENCY_VALUES).default("normal"),
  lines: z.array(requirementLineSchema).min(1, "Add at least one role").max(50, "Up to 50 roles per requirement"),
};

const requirementContactFields = {
  organizationName: f.text({ label: "Company name", max: 200 }),
  contactName: f.text({ label: "Contact person", max: 120 }),
  contactDesignation: f.optionalText(120),
  contactEmail: f.optionalEmail(),
  contactPhone: f.optionalPhone(),
};

const contactRefine = (v: { contactEmail?: string; contactPhone?: string }) => Boolean(v.contactEmail || v.contactPhone);

/** Public "Post a requirement" form (no account). Lines arrive as `lines:json`. */
export const publicRequirementSchema = z
  .object({
    ...requirementWorkFields,
    ...requirementContactFields,
    consentToContact: mustAgree("Please agree that we may contact you about this requirement"),
    website: honeypot,
    sourcePage: sourcePath,
    locale,
    utm,
  })
  .refine(contactRefine, { path: ["contactEmail"], message: "Enter an email address or a phone number" });
export type PublicRequirementInput = z.output<typeof publicRequirementSchema>;

/** Employer Portal requirement (organisation and contact come from the workspace unless overridden). */
export const employerRequirementSchema = z.object({
  ...requirementWorkFields,
  contactName: f.optionalText(120),
  contactDesignation: f.optionalText(120),
  contactEmail: f.optionalEmail(),
  contactPhone: f.optionalPhone(),
  attachmentFileIds: f.uuidArray().pipe(z.array(z.uuid()).max(10, "Up to 10 attachments")),
  asDraft: f.bool(),
});
export type EmployerRequirementInput = z.output<typeof employerRequirementSchema>;

export const requirementStatusSchema = z.object({ id: f.uuid(), status: f.enumOf(REQUIREMENT_STATUS_VALUES), reason: f.optionalText(1000) });

export const requirementQuoteSchema = z
  .object({ id: f.uuid(), amount: f.optionalAmount(), currency: f.currencyCode().optional() })
  .refine((v) => (v.amount === undefined) === (v.currency === undefined), { path: ["currency"], message: "Enter both an amount and its currency, or neither" });

export const requirementInternalNotesSchema = z.object({ id: f.uuid(), internalNotes: f.longText(20_000) });

export const requirementDetailsSchema = z.object({
  id: f.uuid(),
  kind: f.enumOf(REQUIREMENT_KIND_VALUES).optional(),
  title: f.text({ label: "Requirement title", max: 200 }).optional(),
  description: f.longText(10_000),
  countryCode: f.countryCode().optional(),
  locations: f.optionalText(500),
  industryId: f.optionalUuid(),
  contractDurationMonths: f.optionalInt({ min: 1, max: 600 }),
  workingHours: f.optionalText(300),
  joiningBy: f.optionalDate().transform((d) => (d ? d.toISOString().slice(0, 10) : undefined)),
  interviewMethod: f.enumOf(REQUIREMENT_INTERVIEW_METHOD_VALUES).optional(),
  interviewDetails: f.longText(2000),
  assessmentRequired: f.bool().optional(),
  assessmentDetails: f.longText(2000),
  documentationRequirements: f.longText(2000),
  languageRequirements: f.optionalText(500),
  urgency: f.enumOf(REQUIREMENT_URGENCY_VALUES).optional(),
});
export type RequirementDetailsInput = z.output<typeof requirementDetailsSchema>;

export const requirementLineUpsertSchema = z.object({ requirementId: f.uuid(), line: requirementLineSchema });
export const requirementLineLinkSchema = z.object({ lineId: f.uuid(), jobId: nullableUuid });
export const requirementLineFilledSchema = z.object({ lineId: f.uuid(), filledCount: f.int({ min: 0, max: 100_000 }) });
export const requirementCancelSchema = z.object({ id: f.uuid(), reason: f.text({ label: "Reason", max: 1000 }) });

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

const attachmentIds = f.uuidArray().pipe(z.array(z.uuid()).max(5, "Up to 5 attachments"));

/** Signed-in requester (any portal). */
export const ticketCreateSchema = z.object({
  category: f.enumOf(TICKET_CATEGORY_VALUES),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  subject: f.text({ label: "Subject", max: 200 }),
  message: f.text({ label: "Describe the issue", min: 10, max: 10_000 }),
  attachmentFileIds: attachmentIds,
  portal: f.enumOf(PORTAL_VALUES).default("talent"),
  relatedType: z.enum(RELATED_ENTITY_TYPES).optional(),
  relatedId: f.optionalUuid(),
  grievanceType: f.enumOf(GRIEVANCE_TYPE_VALUES).optional(),
});
export type TicketCreateInput = z.output<typeof ticketCreateSchema>;

/** Guest help form (no account). */
export const guestTicketSchema = z.object({
  name: f.text({ label: "Your name", max: 120 }),
  email: f.email(),
  phone: f.optionalPhone(),
  category: f.enumOf(TICKET_CATEGORY_VALUES),
  subject: f.text({ label: "Subject", max: 200 }),
  message: f.text({ label: "Describe the issue", min: 10, max: 10_000 }),
  grievanceType: f.enumOf(GRIEVANCE_TYPE_VALUES).optional(),
  consentToContact: mustAgree("Please agree that we may contact you about your request"),
  website: honeypot,
  locale,
});
export type GuestTicketInput = z.output<typeof guestTicketSchema>;

/** Staff logging a request received by phone, email, WhatsApp or in person. */
export const staffTicketSchema = z
  .object({
    requesterUserId: f.optionalUuid(),
    requesterName: f.optionalText(120),
    requesterEmail: f.optionalEmail(),
    requesterPhone: f.optionalPhone(),
    organizationId: f.optionalUuid(),
    channel: f.enumOf(TICKET_CHANNEL_VALUES).default("phone"),
    category: f.enumOf(TICKET_CATEGORY_VALUES),
    priority: f.enumOf(TICKET_PRIORITY_VALUES).default("normal"),
    subject: f.text({ label: "Subject", max: 200 }),
    message: f.text({ label: "What the requester said", max: 10_000 }),
    grievanceType: f.enumOf(GRIEVANCE_TYPE_VALUES).optional(),
    assignToSelf: f.bool(),
  })
  .refine((v) => Boolean(v.requesterUserId || v.requesterEmail || v.requesterPhone), {
    path: ["requesterEmail"],
    message: "Choose an account or enter an email address or phone number",
  });
export type StaffTicketInput = z.output<typeof staffTicketSchema>;

export const ticketReplySchema = z.object({
  ticketId: f.uuid(),
  body: f.text({ label: "Message", max: 10_000 }),
  attachmentFileIds: attachmentIds,
});

export const staffTicketReplySchema = z.object({
  ticketId: f.uuid(),
  body: f.text({ label: "Message", max: 10_000 }),
  attachmentFileIds: attachmentIds,
  internal: f.bool(),
  status: f.enumOf(TICKET_STATUS_VALUES).optional(),
});

export const ticketStatusSchema = z
  .object({ ticketId: f.uuid(), status: f.enumOf(TICKET_STATUS_VALUES), resolution: f.longText(5000) })
  .refine((v) => v.status !== "resolved" || Boolean(v.resolution), { path: ["resolution"], message: "Summarise the resolution for the requester" });

export const ticketPrioritySchema = z.object({ ticketId: f.uuid(), priority: f.enumOf(TICKET_PRIORITY_VALUES) });
export const ticketEscalateSchema = z.object({ ticketId: f.uuid(), note: f.text({ label: "Reason", max: 2000 }), assigneeUserId: f.optionalUuid() });
export const ticketGrievanceSchema = z.object({ ticketId: f.uuid(), grievanceType: f.enumOf(GRIEVANCE_TYPE_VALUES) });
export const ticketTagsSchema = z.object({ ticketId: f.uuid(), tags: f.stringArray().pipe(z.array(z.string().max(40)).max(20)) });
export const ticketRatingSchema = z.object({ ticketId: f.uuid(), rating: f.int({ min: 1, max: 5 }), comment: f.longText(2000) });
export const ticketIdSchema = z.object({ ticketId: f.uuid() });

// ---------------------------------------------------------------------------
// Internal tasks and notes
// ---------------------------------------------------------------------------

export const staffTaskSchema = z.object({
  title: f.text({ label: "Task", max: 200 }),
  description: f.longText(5000),
  priority: f.enumOf(STAFF_TASK_PRIORITY_VALUES).default("normal"),
  dueAt: optionalDateTime,
  assignedToUserId: f.optionalUuid(),
  organizationId: f.optionalUuid(),
  relatedType: z.enum(RELATED_ENTITY_TYPES).optional(),
  relatedId: f.optionalUuid(),
});
export type StaffTaskInput = z.output<typeof staffTaskSchema>;

export const staffTaskUpdateSchema = staffTaskSchema.partial().extend({ id: f.uuid() });
export type StaffTaskUpdateInput = z.output<typeof staffTaskUpdateSchema>;
export const staffTaskStatusSchema = z.object({ id: f.uuid(), status: f.enumOf(STAFF_TASK_STATUS_VALUES) });

export const internalNoteSchema = z.object({
  entityType: z.enum(NOTE_ENTITY_TYPES),
  entityId: f.uuid(),
  body: f.text({ label: "Note", max: 10_000 }),
  visibility: f.enumOf(NOTE_VISIBILITY_VALUES).default("staff"),
  organizationId: f.optionalUuid(),
  pinned: f.bool(),
});
export type InternalNoteInput = z.output<typeof internalNoteSchema>;
export const internalNoteUpdateSchema = z.object({ id: f.uuid(), body: f.text({ label: "Note", max: 10_000 }).optional(), pinned: f.bool().optional() });

// ---------------------------------------------------------------------------
// Message threads
// ---------------------------------------------------------------------------

/** Which capacity the signed-in person acts in (decides the guard the action uses). */
export const actorPortalSchema = z.enum(["admin", "employer", "recruiter", "institution", "talent"]);
export type ActorPortal = z.infer<typeof actorPortalSchema>;

export const threadCreateSchema = z
  .object({
    portal: actorPortalSchema,
    subject: f.text({ label: "Subject", max: 200 }),
    contextType: f.enumOf(THREAD_CONTEXT_VALUES).default("general"),
    contextId: f.optionalUuid(),
    organizationId: f.optionalUuid(),
    participantUserIds: f.uuidArray().pipe(z.array(z.uuid()).max(20)),
    message: f.text({ label: "Message", max: 10_000 }),
    attachmentFileIds: attachmentIds,
  })
  .refine((v) => v.contextType === "general" || Boolean(v.contextId), { path: ["contextId"], message: "Choose what this conversation is about" });
export type ThreadCreateInput = z.output<typeof threadCreateSchema>;

export const threadMessageSchema = z.object({
  portal: actorPortalSchema,
  threadId: f.uuid(),
  body: f.text({ label: "Message", max: 10_000 }),
  attachmentFileIds: attachmentIds,
});
export type ThreadMessageInput = z.output<typeof threadMessageSchema>;

export const threadRefSchema = z.object({ portal: actorPortalSchema, threadId: f.uuid() });
export const threadParticipantSchema = z.object({ threadId: f.uuid(), userId: f.uuid() });
export const threadStatusSchema = z.object({ portal: actorPortalSchema, threadId: f.uuid(), status: z.enum(["open", "closed"]) });
export const threadMuteSchema = z.object({ portal: actorPortalSchema, threadId: f.uuid(), muted: z.boolean() });
export const threadMessageHideSchema = z.object({ messageId: f.uuid() });
