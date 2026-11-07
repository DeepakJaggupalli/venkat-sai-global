/**
 * Code default templates — one per event in events.ts (client-safe data; TypeScript enforces completeness).
 * Admins override them per channel and language at /admin/notifications/templates (notification_templates);
 * an active override for (event, channel, locale) wins, then the English override, then these defaults.
 *
 * Syntax: see render.ts — {{key}}, {{#key}}…{{/key}} (only when present), {{^key}}…{{/key}} (only when absent),
 * Markdown-lite bodies. Values the dispatcher always provides:
 *   recipientName  display name of the recipient (empty for unnamed email / phone recipients)
 *   appName        "Venkat Sai Global"
 *   link           absolute URL of the notification link (when one was given)
 *   <key>Label     humanised copy of every snake_case string value (status "under_review" → statusLabel "Under review")
 * `forStaff: true` in `data` switches audience-aware templates (requirement.received, enquiry.received,
 * support.ticket_created, support.ticket_reply) to the staff wording.
 *
 * Copy rules: plain English, sentence case, no hype, no exclamation marks, no promises of jobs, visas or
 * outcomes, never ask candidates to pay.
 */
import { NOTIFICATION_EVENTS, type NotificationEvent } from "./events";

export type DefaultTemplate = {
  /** Email subject and in-app title. */
  subject: string;
  /** Markdown-lite body (email + in-app; SMS falls back to the subject when `sms` is absent). */
  body: string;
  /** Email button label (shown only when the notification has a link). */
  cta?: string;
  /** Short plain-text SMS version. */
  sms?: string;
  /** Example values for the admin preview — obviously sample data, never real people or companies. */
  sample: Record<string, string | number | boolean>;
};

const HELLO = "Hello{{#recipientName}} {{recipientName}}{{/recipientName}},";
const NO_FEES = "Venkat Sai Global never charges candidates to apply for a job, and no payment can guarantee a job, visa or placement.";

const S = {
  recipientName: "Recipient name",
  organizationName: "Sample organisation",
  jobTitle: "Sample job title",
  code: "VSG-XXX-000123",
  title: "Sample title",
  reason: "Sample reason entered by the reviewer.",
  time: "2026-11-07T10:30:00.000Z",
} as const;

/**
 * Typed as a partial map on purpose: other modules add event keys to events.ts independently, and a missing
 * template must never break the build. `templates.test.ts` fails when an event has no default template, and
 * `getDefaultTemplate()` falls back to a generic template built from the event label.
 */
export const DEFAULT_TEMPLATES: Partial<Record<NotificationEvent, DefaultTemplate>> = {
  // -------------------------------------------------------------------------
  // Account & security
  // -------------------------------------------------------------------------
  "account.welcome": {
    subject: "Welcome to Venkat Sai Global",
    body: `${HELLO}\n\nYour Venkat Sai Global account is ready. You can now complete your profile, discover opportunities, training and services, and manage everything from one place.\n\nIf you did not create this account, please contact our support team.`,
    cta: "Open your account",
    sample: { recipientName: S.recipientName },
  },
  "account.password_changed": {
    subject: "Your password was changed",
    body: `${HELLO}\n\nThe password for your Venkat Sai Global account was changed{{#time}} on {{time}}{{/time}}.\n\nIf you made this change, no action is needed. If you did not, reset your password straight away and contact our support team.`,
    cta: "Review account security",
    sample: { recipientName: S.recipientName, time: S.time },
  },
  "account.security_alert": {
    subject: "Security alert for your account",
    body: `${HELLO}\n\n{{#summary}}{{summary}}{{/summary}}{{^summary}}There was a security-related change on your Venkat Sai Global account.{{/summary}}\n\n{{#time}}- Time: {{time}}\n{{/time}}{{#device}}- Device: {{device}}\n{{/device}}\n\nIf this was you, no action is needed. If not, change your password and review your active sessions.`,
    cta: "Review account security",
    sample: { recipientName: S.recipientName, summary: "A new device signed in to your account.", time: S.time, device: "Chrome on Windows" },
  },
  "account.closed": {
    subject: "Your account has been closed",
    body: `${HELLO}\n\nYour Venkat Sai Global account has been closed{{#reason}}: {{reason}}{{/reason}}.\n\nIf you think this is a mistake, please contact our support team.`,
    sample: { recipientName: S.recipientName },
  },

  // -------------------------------------------------------------------------
  // Organisations
  // -------------------------------------------------------------------------
  "org.invitation": {
    subject: "Invitation to join {{organizationName}} on Venkat Sai Global",
    body: "Hello,\n\n{{#inviterName}}{{inviterName}} has invited you{{/inviterName}}{{^inviterName}}You have been invited{{/inviterName}} to join **{{organizationName}}** on Venkat Sai Global{{#roleName}} as {{roleName}}{{/roleName}}.\n\nUse the button below to accept the invitation{{#expiresAt}} before {{expiresAt}}{{/expiresAt}}. If you were not expecting it, you can ignore this email.",
    cta: "Accept invitation",
    sample: { inviterName: "Inviter name", organizationName: S.organizationName, roleName: "Recruiter", expiresAt: S.time },
  },
  "org.verification_submitted": {
    subject: "Verification submitted for {{organizationName}}",
    body: `${HELLO}\n\nWe have received the verification details for **{{organizationName}}**. Our team will review them and let you know the outcome.`,
    cta: "View verification status",
    sample: { recipientName: S.recipientName, organizationName: S.organizationName },
  },
  "org.verification_approved": {
    subject: "{{organizationName}} is now verified",
    body: `${HELLO}\n\n**{{organizationName}}** has been verified by Venkat Sai Global.`,
    cta: "Open your workspace",
    sample: { recipientName: S.recipientName, organizationName: S.organizationName },
  },
  "org.verification_rejected": {
    subject: "Verification not approved for {{organizationName}}",
    body: `${HELLO}\n\nWe could not verify **{{organizationName}}** with the details provided.{{#reason}}\n\nReason: {{reason}}{{/reason}}\n\nYou can review the details and submit them again.`,
    cta: "Review verification",
    sample: { recipientName: S.recipientName, organizationName: S.organizationName, reason: S.reason },
  },
  "org.verification_changes_requested": {
    subject: "Changes needed to verify {{organizationName}}",
    body: `${HELLO}\n\nOur team needs some changes before **{{organizationName}}** can be verified.{{#reason}}\n\nWhat to change: {{reason}}{{/reason}}`,
    cta: "Update verification details",
    sample: { recipientName: S.recipientName, organizationName: S.organizationName, reason: S.reason },
  },
  "org.verification_expiring": {
    subject: "Verification for {{organizationName}} is expiring",
    body: `${HELLO}\n\n{{#itemName}}{{itemName}}{{/itemName}}{{^itemName}}The verification{{/itemName}} for **{{organizationName}}** expires{{#expiresOn}} on {{expiresOn}}{{/expiresOn}}{{^expiresOn}} soon{{/expiresOn}}. Please provide current documents to keep your verified status.`,
    cta: "Renew verification",
    sample: { recipientName: S.recipientName, organizationName: S.organizationName, itemName: "Trade licence", expiresOn: "2026-12-31" },
  },
  "org.member_added": {
    subject: "{{#memberName}}{{memberName}}{{/memberName}}{{^memberName}}A new member{{/memberName}} joined {{organizationName}}",
    body: "{{#memberName}}{{memberName}}{{/memberName}}{{^memberName}}A new team member{{/memberName}} has joined **{{organizationName}}**{{#roleName}} as {{roleName}}{{/roleName}}.",
    cta: "View team",
    sample: { memberName: "Member name", organizationName: S.organizationName, roleName: "Recruiter" },
  },

  // -------------------------------------------------------------------------
  // Jobs
  // -------------------------------------------------------------------------
  "job.submitted": {
    subject: "Job submitted for review: {{jobTitle}}",
    body: "**{{jobTitle}}**{{#code}} ({{code}}){{/code}} has been submitted for review. You will be notified when it is approved or if changes are needed.",
    cta: "View job",
    sample: { jobTitle: S.jobTitle, code: "VSG-JOB-000123" },
  },
  "job.approved": {
    subject: "Job published: {{jobTitle}}",
    body: "**{{jobTitle}}**{{#code}} ({{code}}){{/code}} has been approved and is now published.",
    cta: "View job",
    sample: { jobTitle: S.jobTitle, code: "VSG-JOB-000123" },
  },
  "job.rejected": {
    subject: "Job not approved: {{jobTitle}}",
    body: "**{{jobTitle}}**{{#code}} ({{code}}){{/code}} was not approved for publication.{{#reason}}\n\nReason: {{reason}}{{/reason}}",
    cta: "View job",
    sample: { jobTitle: S.jobTitle, code: "VSG-JOB-000123", reason: S.reason },
  },
  "job.changes_requested": {
    subject: "Changes needed: {{jobTitle}}",
    body: "**{{jobTitle}}**{{#code}} ({{code}}){{/code}} needs changes before it can be published.{{#reason}}\n\nWhat to change: {{reason}}{{/reason}}",
    cta: "Edit job",
    sample: { jobTitle: S.jobTitle, code: "VSG-JOB-000123", reason: S.reason },
  },
  "job.closing_soon": {
    subject: "Closing soon: {{jobTitle}}",
    body: "**{{jobTitle}}**{{#code}} ({{code}}){{/code}} closes{{#closesOn}} on {{closesOn}}{{/closesOn}}{{^closesOn}} soon{{/closesOn}}. Extend the deadline if you are still hiring.",
    cta: "View job",
    sample: { jobTitle: S.jobTitle, code: "VSG-JOB-000123", closesOn: "2026-11-30" },
  },
  "job.alert_digest": {
    subject: "New jobs matching {{#alertName}}{{alertName}}{{/alertName}}{{^alertName}}your job alert{{/alertName}}",
    body: `${HELLO}\n\nThere are new jobs that match your job alert{{#alertName}} "{{alertName}}"{{/alertName}}.{{#count}} New matches: {{count}}.{{/count}}{{#jobList}}\n\n{{jobList}}{{/jobList}}\n\nYou can change or pause this alert at any time.`,
    cta: "View matching jobs",
    sample: { recipientName: S.recipientName, alertName: "Sample alert", count: 3 },
  },

  // -------------------------------------------------------------------------
  // Applications
  // -------------------------------------------------------------------------
  "application.submitted": {
    subject: "Application submitted{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: `${HELLO}\n\nYour application{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}} has been submitted{{#code}} (reference {{code}}){{/code}}. You can follow its progress in the People Portal.\n\n${NO_FEES}`,
    cta: "Track your application",
    sample: { recipientName: S.recipientName, jobTitle: S.jobTitle, code: "VSG-APP-000123" },
  },
  "application.status_changed": {
    subject: "Update on your application{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: `${HELLO}\n\nThere is an update on your application{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#code}} ({{code}}){{/code}}.{{#status}}\n\nCurrent status: **{{status}}**{{/status}}{{#note}}\n\n{{note}}{{/note}}`,
    cta: "View application",
    sample: { recipientName: S.recipientName, jobTitle: S.jobTitle, code: "VSG-APP-000123", status: "Shortlisted" },
  },
  "application.withdrawn": {
    subject: "Application withdrawn{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: "Your application{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#code}} ({{code}}){{/code}} has been withdrawn.",
    cta: "View applications",
    sample: { jobTitle: S.jobTitle, code: "VSG-APP-000123" },
  },
  "application.received": {
    subject: "New application{{#jobTitle}} for {{jobTitle}}{{/jobTitle}}",
    body: "A new application{{#code}} ({{code}}){{/code}} has been received{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#candidateName}} from {{candidateName}}{{/candidateName}}.",
    cta: "Review application",
    sample: { jobTitle: S.jobTitle, code: "VSG-APP-000123", candidateName: "Candidate name" },
  },

  // -------------------------------------------------------------------------
  // Interviews & assessments
  // -------------------------------------------------------------------------
  "interview.scheduled": {
    subject: "Interview scheduled{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: `${HELLO}\n\nAn interview has been scheduled{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}.\n\n{{#roundName}}- Round: {{roundName}}\n{{/roundName}}{{#startsAt}}- When: {{startsAt}}\n{{/startsAt}}{{#modeLabel}}- Format: {{modeLabel}}\n{{/modeLabel}}{{#location}}- Where: {{location}}\n{{/location}}\n\nPlease confirm your attendance in the portal.`,
    cta: "View interview details",
    sms: "Venkat Sai Global: interview scheduled{{#jobTitle}} for {{jobTitle}}{{/jobTitle}}{{#startsAt}} on {{startsAt}}{{/startsAt}}.{{#link}} Details: {{link}}{{/link}}",
    sample: { recipientName: S.recipientName, jobTitle: S.jobTitle, roundName: "Technical round", startsAt: S.time, mode: "video", location: "Online" },
  },
  "interview.rescheduled": {
    subject: "Interview rescheduled{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: `${HELLO}\n\nYour interview{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}} has been moved to a new time.\n\n{{#roundName}}- Round: {{roundName}}\n{{/roundName}}{{#startsAt}}- New time: {{startsAt}}\n{{/startsAt}}{{#modeLabel}}- Format: {{modeLabel}}\n{{/modeLabel}}{{#location}}- Where: {{location}}\n{{/location}}\n\nPlease confirm the new time in the portal.`,
    cta: "View interview details",
    sms: "Venkat Sai Global: interview rescheduled{{#jobTitle}} for {{jobTitle}}{{/jobTitle}}{{#startsAt}} to {{startsAt}}{{/startsAt}}.{{#link}} Details: {{link}}{{/link}}",
    sample: { recipientName: S.recipientName, jobTitle: S.jobTitle, startsAt: S.time, mode: "in_person", location: "Sample venue" },
  },
  "interview.cancelled": {
    subject: "Interview cancelled{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: `${HELLO}\n\nYour interview{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#startsAt}} on {{startsAt}}{{/startsAt}} has been cancelled.{{#reason}}\n\nReason: {{reason}}{{/reason}}`,
    cta: "View details",
    sms: "Venkat Sai Global: interview cancelled{{#jobTitle}} for {{jobTitle}}{{/jobTitle}}{{#startsAt}} on {{startsAt}}{{/startsAt}}.",
    sample: { recipientName: S.recipientName, jobTitle: S.jobTitle, startsAt: S.time },
  },
  "interview.reminder": {
    subject: "Reminder: interview{{#startsAt}} on {{startsAt}}{{/startsAt}}",
    body: `${HELLO}\n\nThis is a reminder of your interview{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#startsAt}} on {{startsAt}}{{/startsAt}}.{{#location}}\n\nWhere: {{location}}{{/location}}`,
    cta: "View interview details",
    sms: "Venkat Sai Global reminder: interview{{#jobTitle}} for {{jobTitle}}{{/jobTitle}}{{#startsAt}} on {{startsAt}}{{/startsAt}}.",
    sample: { recipientName: S.recipientName, jobTitle: S.jobTitle, startsAt: S.time },
  },
  "interview.response_received": {
    subject: "Interview response{{#candidateName}} from {{candidateName}}{{/candidateName}}{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: "{{#candidateName}}{{candidateName}}{{/candidateName}}{{^candidateName}}The candidate{{/candidateName}} has responded to the interview invitation{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#startsAt}} ({{startsAt}}){{/startsAt}}.{{#response}}\n\nResponse: **{{responseLabel}}**{{/response}}{{#note}}\n\n{{note}}{{/note}}",
    cta: "View interview",
    sample: { candidateName: "Candidate name", jobTitle: S.jobTitle, startsAt: S.time, response: "confirmed" },
  },
  "assessment.scheduled": {
    subject: "Assessment scheduled{{#assessmentName}}: {{assessmentName}}{{/assessmentName}}",
    body: `${HELLO}\n\nAn assessment has been scheduled for you{{#assessmentName}}: **{{assessmentName}}**{{/assessmentName}}.\n\n{{#scheduledAt}}- When: {{scheduledAt}}\n{{/scheduledAt}}{{#centreName}}- Where: {{centreName}}\n{{/centreName}}{{#address}}- Address: {{address}}\n{{/address}}\n\nPlease bring a valid photo ID.`,
    cta: "View assessment details",
    sms: "Venkat Sai Global: assessment scheduled{{#assessmentName}} ({{assessmentName}}){{/assessmentName}}{{#scheduledAt}} on {{scheduledAt}}{{/scheduledAt}}.",
    sample: { recipientName: S.recipientName, assessmentName: "Practical trade test", scheduledAt: S.time, centreName: "Sample assessment centre" },
  },
  "assessment.result": {
    subject: "Your assessment result is available",
    body: `${HELLO}\n\nThe result of your assessment{{#assessmentName}} **{{assessmentName}}**{{/assessmentName}} is now available. Sign in to see it and any next steps.`,
    cta: "View result",
    sample: { recipientName: S.recipientName, assessmentName: "Practical trade test" },
  },

  // -------------------------------------------------------------------------
  // Offers & placement
  // -------------------------------------------------------------------------
  "offer.issued": {
    subject: "Offer received{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: `${HELLO}\n\nYou have received an offer{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#organizationName}} from {{organizationName}}{{/organizationName}}.{{#expiresAt}} Please respond by {{expiresAt}}.{{/expiresAt}}\n\nReview the offer details carefully before you respond. ${NO_FEES}`,
    cta: "Review offer",
    sample: { recipientName: S.recipientName, jobTitle: S.jobTitle, organizationName: S.organizationName, expiresAt: S.time },
  },
  "offer.responded": {
    subject: "Offer {{#responseLabel}}{{responseLabel}}{{/responseLabel}}{{^responseLabel}}response{{/responseLabel}}{{#jobTitle}}: {{jobTitle}}{{/jobTitle}}",
    body: "{{#candidateName}}{{candidateName}}{{/candidateName}}{{^candidateName}}The candidate{{/candidateName}} has {{#response}}{{response}}{{/response}}{{^response}}responded to{{/response}} the offer{{#jobTitle}} for **{{jobTitle}}**{{/jobTitle}}{{#code}} ({{code}}){{/code}}.",
    cta: "View offer",
    sample: { candidateName: "Candidate name", response: "accepted", jobTitle: S.jobTitle, code: "VSG-OFR-000123" },
  },
  "placement.mobilisation_update": {
    subject: "Update on your joining process",
    body: `${HELLO}\n\nThere is an update on your joining and travel process{{#status}}: **{{status}}**{{/status}}.{{#note}}\n\n{{note}}{{/note}}`,
    cta: "View details",
    sample: { recipientName: S.recipientName, status: "Visa processing" },
  },
  "placement.joined": {
    subject: "Joining confirmed{{#candidateName}}: {{candidateName}}{{/candidateName}}",
    body: "{{#candidateName}}{{candidateName}}{{/candidateName}}{{^candidateName}}The candidate{{/candidateName}} has joined{{#jobTitle}} as {{jobTitle}}{{/jobTitle}}{{#joinedOn}} on {{joinedOn}}{{/joinedOn}}.",
    cta: "View placement",
    sample: { candidateName: "Candidate name", jobTitle: S.jobTitle, joinedOn: "2026-11-01" },
  },

  // -------------------------------------------------------------------------
  // Workforce requirements
  // -------------------------------------------------------------------------
  "requirement.received": {
    subject: "{{#forStaff}}New workforce requirement {{code}}{{/forStaff}}{{^forStaff}}We received your workforce requirement {{code}}{{/forStaff}}",
    body: `{{#forStaff}}A workforce requirement has been submitted{{#organizationName}} by **{{organizationName}}**{{/organizationName}}.\n\n- Reference: {{code}}\n- Title: {{title}}{{#totalPositions}}\n- Positions: {{totalPositions}}{{/totalPositions}}{{#countryName}}\n- Country of work: {{countryName}}{{/countryName}}{{#sourceLabel}}\n- Received via: {{sourceLabel}}{{/sourceLabel}}{{/forStaff}}{{^forStaff}}${HELLO}\n\nThank you for your workforce requirement **{{title}}**. Your reference is **{{code}}**. Our team will review it and contact you about the next steps.{{/forStaff}}`,
    cta: "View requirement",
    sample: { forStaff: true, organizationName: S.organizationName, code: "VSG-REQ-000123", title: "Sample requirement", totalPositions: 20, countryName: "Sample country", source: "public_form" },
  },
  "requirement.status_changed": {
    subject: "Update on requirement {{code}}",
    body: `{{#forStaff}}Workforce requirement **{{title}}** ({{code}}){{#organizationName}} from {{organizationName}}{{/organizationName}} is now **{{status}}**.{{/forStaff}}{{^forStaff}}${HELLO}\n\nThe status of your workforce requirement **{{title}}** ({{code}}) is now **{{status}}**.{{/forStaff}}{{#reason}}\n\n{{reason}}{{/reason}}`,
    cta: "View requirement",
    sample: { recipientName: S.recipientName, code: "VSG-REQ-000123", title: "Sample requirement", status: "Approved" },
  },

  // -------------------------------------------------------------------------
  // Enquiries
  // -------------------------------------------------------------------------
  "enquiry.received": {
    subject: "{{#forStaff}}New enquiry {{code}}{{#typeLabel}} ({{typeLabel}}){{/typeLabel}}{{/forStaff}}{{^forStaff}}We received your enquiry {{code}}{{/forStaff}}",
    body: `{{#forStaff}}A new enquiry has been received{{#senderName}} from **{{senderName}}**{{/senderName}}{{#organizationName}} ({{organizationName}}){{/organizationName}}.\n\n- Reference: {{code}}{{#typeLabel}}\n- Type: {{typeLabel}}{{/typeLabel}}{{#subject}}\n- Subject: {{subject}}{{/subject}}{{/forStaff}}{{^forStaff}}${HELLO}\n\nThank you for contacting Venkat Sai Global. We have received your enquiry{{#subject}} "{{subject}}"{{/subject}} and our team will get back to you. Your reference is **{{code}}**.{{/forStaff}}`,
    cta: "Open enquiry",
    sms: "{{#forStaff}}New enquiry {{code}} received.{{/forStaff}}{{^forStaff}}Venkat Sai Global: we received your enquiry. Your reference is {{code}}.{{/forStaff}}",
    sample: { forStaff: true, senderName: "Sender name", organizationName: S.organizationName, code: "VSG-ENQ-000123", type: "employer", subject: "Sample subject" },
  },

  // -------------------------------------------------------------------------
  // Recruitment partners
  // -------------------------------------------------------------------------
  "partner.assignment_created": {
    subject: "New requirement assigned{{#title}}: {{title}}{{/title}}",
    body: "Venkat Sai Global has assigned a requirement to your agency{{#title}}: **{{title}}**{{/title}}{{#code}} ({{code}}){{/code}}.{{#positionsTarget}} Target positions: {{positionsTarget}}.{{/positionsTarget}}{{#dueDate}} Due by {{dueDate}}.{{/dueDate}}",
    cta: "View assignment",
    sample: { title: "Sample requirement", code: "VSG-REQ-000123", positionsTarget: 10, dueDate: "2026-12-15" },
  },
  "partner.assignment_updated": {
    subject: "Assignment updated{{#title}}: {{title}}{{/title}}",
    body: "The assignment{{#title}} **{{title}}**{{/title}}{{#code}} ({{code}}){{/code}} has been updated{{#status}}. New status: **{{statusLabel}}**{{/status}}.{{#reason}}\n\n{{reason}}{{/reason}}",
    cta: "View assignment",
    sample: { title: "Sample requirement", code: "VSG-REQ-000123", status: "paused", reason: S.reason },
  },
  "partner.submission_status_changed": {
    subject: "Submission {{code}} updated",
    body: "The status of submission **{{code}}**{{#candidateName}} for {{candidateName}}{{/candidateName}} is now **{{status}}**.{{#feedback}}\n\nFeedback: {{feedback}}{{/feedback}}",
    cta: "View submission",
    sample: { code: "VSG-SUB-000123", candidateName: "Candidate name", status: "Under review" },
  },
  "partner.submission_received": {
    subject: "New partner submission{{#code}} {{code}}{{/code}}",
    body: "{{#partnerName}}{{partnerName}}{{/partnerName}}{{^partnerName}}A recruitment partner{{/partnerName}} submitted a candidate{{#title}} for **{{title}}**{{/title}}{{#code}} (submission {{code}}){{/code}}. It is waiting for review.",
    cta: "Review submission",
    sample: { partnerName: "Partner agency name", title: "Sample requirement", code: "VSG-SUB-000123" },
  },
  "candidate.partner_submission_notice": {
    subject: "A recruitment partner shared your profile with Venkat Sai Global",
    body: `${HELLO}\n\n{{#partnerName}}{{partnerName}}, a recruitment partner,{{/partnerName}}{{^partnerName}}A recruitment partner{{/partnerName}} has shared your details with Venkat Sai Global{{#title}} for **{{title}}**{{/title}}.\n\nYou can review your profile, confirm or withdraw the submission, or object to the use of your details at any time. ${NO_FEES}`,
    cta: "Review your profile",
    sms: "Venkat Sai Global: {{#partnerName}}{{partnerName}}{{/partnerName}}{{^partnerName}}a recruitment partner{{/partnerName}} shared your profile with us.{{#link}} Review or object: {{link}}{{/link}}",
    sample: { recipientName: S.recipientName, partnerName: "Partner agency name", title: S.jobTitle },
  },
  "partner.document_requested": {
    subject: "Document requested{{#candidateName}} for {{candidateName}}{{/candidateName}}",
    body: "Venkat Sai Global has requested {{#documentName}}**{{documentName}}**{{/documentName}}{{^documentName}}a document{{/documentName}}{{#candidateName}} for {{candidateName}}{{/candidateName}}{{#code}} (submission {{code}}){{/code}}.{{#dueDate}} Please upload it by {{dueDate}}.{{/dueDate}}",
    cta: "Upload document",
    sample: { documentName: "Passport copy", candidateName: "Candidate name", code: "VSG-SUB-000123", dueDate: "2026-11-20" },
  },

  // -------------------------------------------------------------------------
  // Training
  // -------------------------------------------------------------------------
  "training.enrolment_confirmed": {
    subject: "Enrolment confirmed{{#courseTitle}}: {{courseTitle}}{{/courseTitle}}",
    body: `${HELLO}\n\nYour enrolment{{#courseTitle}} in **{{courseTitle}}**{{/courseTitle}}{{#batchTitle}} ({{batchTitle}}){{/batchTitle}} is confirmed.{{#startsOn}} The batch starts on {{startsOn}}.{{/startsOn}}{{#venue}} Venue: {{venue}}.{{/venue}}`,
    cta: "View enrolment",
    sample: { recipientName: S.recipientName, courseTitle: "Sample course", batchTitle: "Sample batch", startsOn: "2026-12-01" },
  },
  "training.batch_starting": {
    subject: "Your batch starts soon{{#courseTitle}}: {{courseTitle}}{{/courseTitle}}",
    body: `${HELLO}\n\n{{#courseTitle}}**{{courseTitle}}**{{/courseTitle}}{{^courseTitle}}Your batch{{/courseTitle}}{{#batchTitle}} ({{batchTitle}}){{/batchTitle}} starts{{#startsOn}} on {{startsOn}}{{/startsOn}}{{^startsOn}} soon{{/startsOn}}.{{#venue}} Venue: {{venue}}.{{/venue}}`,
    cta: "View batch details",
    sms: "Venkat Sai Global: your batch{{#courseTitle}} for {{courseTitle}}{{/courseTitle}} starts{{#startsOn}} on {{startsOn}}{{/startsOn}}{{^startsOn}} soon{{/startsOn}}.",
    sample: { recipientName: S.recipientName, courseTitle: "Sample course", startsOn: "2026-12-01", venue: "Sample venue" },
  },
  "training.certificate_issued": {
    subject: "Certificate issued{{#certificateTitle}}: {{certificateTitle}}{{/certificateTitle}}",
    body: `${HELLO}\n\nYour certificate{{#certificateTitle}} **{{certificateTitle}}**{{/certificateTitle}}{{#code}} ({{code}}){{/code}} has been issued{{#issuerName}} by {{issuerName}}{{/issuerName}}.{{#verificationCode}} It can be checked on Venkat Sai Global with the verification code {{verificationCode}}.{{/verificationCode}}`,
    cta: "View certificate",
    sample: { recipientName: S.recipientName, certificateTitle: "Sample certificate", code: "VSG-CRT-000123", verificationCode: "SAMPLE-CODE" },
  },

  // -------------------------------------------------------------------------
  // Billing
  // -------------------------------------------------------------------------
  "billing.invoice_issued": {
    subject: "Invoice {{code}} issued",
    body: "Invoice **{{code}}**{{#amount}} for {{amount}}{{/amount}} has been issued{{#organizationName}} to {{organizationName}}{{/organizationName}}.{{#dueAt}} Payment is due by {{dueAt}}.{{/dueAt}}",
    cta: "View invoice",
    sample: { code: "VSG-INV-2026-000123", amount: "[formatted amount]", organizationName: S.organizationName, dueAt: "2026-11-30" },
  },
  "billing.payment_received": {
    subject: "Payment received{{#code}}: {{code}}{{/code}}",
    body: "We have received your payment{{#amount}} of {{amount}}{{/amount}}{{#invoiceCode}} for invoice {{invoiceCode}}{{/invoiceCode}}. Thank you.",
    cta: "View billing",
    sample: { code: "VSG-PAY-000123", amount: "[formatted amount]", invoiceCode: "VSG-INV-2026-000123" },
  },
  "billing.payment_failed": {
    subject: "Payment failed{{#invoiceCode}} for invoice {{invoiceCode}}{{/invoiceCode}}",
    body: "A payment{{#amount}} of {{amount}}{{/amount}}{{#invoiceCode}} for invoice {{invoiceCode}}{{/invoiceCode}} could not be completed.{{#reason}} Reason: {{reason}}.{{/reason}} Please try again or use another payment method.",
    cta: "View billing",
    sample: { amount: "[formatted amount]", invoiceCode: "VSG-INV-2026-000123", reason: "Declined by the bank" },
  },
  "billing.renewal_due": {
    subject: "Subscription renewal due{{#planName}}: {{planName}}{{/planName}}",
    body: "Your {{#planName}}**{{planName}}** {{/planName}}subscription{{#renewsOn}} renews or ends on {{renewsOn}}{{/renewsOn}}{{^renewsOn}} is due for renewal{{/renewsOn}}. Review your plan and billing details to avoid interruption.",
    cta: "Review subscription",
    sample: { planName: "Sample plan", renewsOn: "2026-12-01" },
  },
  "billing.subscription_expired": {
    subject: "Subscription expired{{#planName}}: {{planName}}{{/planName}}",
    body: "Your {{#planName}}**{{planName}}** {{/planName}}subscription has expired. Features included in the plan are not available until it is renewed.",
    cta: "Renew subscription",
    sample: { planName: "Sample plan" },
  },
  "billing.credits_low": {
    subject: "Credits running low{{#creditName}}: {{creditName}}{{/creditName}}",
    body: "Your organisation has {{#remaining}}{{remaining}} {{/remaining}}{{#creditName}}{{creditName}} {{/creditName}}credits left. Top up or change your plan to keep using this feature.",
    cta: "View credits",
    sample: { remaining: 2, creditName: "candidate unlock" },
  },
  "billing.refund_processed": {
    subject: "Refund processed{{#code}}: {{code}}{{/code}}",
    body: "Your refund{{#amount}} of {{amount}}{{/amount}}{{#code}} ({{code}}){{/code}} has been processed. It may take a few working days to appear, depending on your bank or payment provider.",
    cta: "View billing",
    sample: { code: "VSG-RFD-000123", amount: "[formatted amount]" },
  },
  "billing.subscription_changed": {
    subject: "Your {{#planName}}{{planName}} {{/planName}}plan has changed",
    body: "Your {{#planName}}**{{planName}}** {{/planName}}subscription update: {{changeLabel}}.{{#statusLabel}} Current status: {{statusLabel}}.{{/statusLabel}}{{#periodEnd}} The current period ends on {{periodEnd}}.{{/periodEnd}}",
    cta: "View subscription",
    sample: { planName: "Sample plan", change: "activated", changeLabel: "Activated", status: "active", statusLabel: "Active", periodEnd: "2026-12-01" },
  },
  "billing.dispute_updated": {
    subject: "{{#forStaff}}New billing dispute{{/forStaff}}{{^forStaff}}Billing dispute update: {{statusLabel}}{{/forStaff}}",
    body: `{{#forStaff}}An organisation has raised a billing dispute.{{#reason}} Reason given: {{reason}}{{/reason}} Review it in the Command Centre.{{/forStaff}}{{^forStaff}}${HELLO}

Your billing dispute is now **{{statusLabel}}**.{{#resolution}} Resolution: {{resolution}}{{/resolution}}{{/forStaff}}`,
    cta: "View dispute",
    sample: { status: "under_review", statusLabel: "Under review", resolution: "Sample resolution note.", reason: S.reason },
  },
  "partner.settlement_updated": {
    subject: "Settlement {{code}}: {{changeLabel}}",
    body: "{{#forStaff}}Partner settlement **{{code}}** was {{changeLabel}}.{{#reason}} Reason given: {{reason}}{{/reason}}{{/forStaff}}{{^forStaff}}Settlement **{{code}}** was {{changeLabel}}.{{#amount}} Net payable: {{amount}}.{{/amount}}{{#periodStart}} Period: {{periodStart}} to {{periodEnd}}.{{/periodStart}}{{#paymentReference}} Payment reference: {{paymentReference}}.{{/paymentReference}}{{/forStaff}}",
    cta: "View settlement",
    sample: { code: "VSG-STL-000123", change: "approved", changeLabel: "Approved", amount: "[formatted amount]", periodStart: "2026-10-01", periodEnd: "2026-10-31", paymentReference: "SAMPLE-REF" },
  },

  // -------------------------------------------------------------------------
  // Support & privacy
  // -------------------------------------------------------------------------
  "support.ticket_created": {
    subject: "{{#forStaff}}New support request {{code}}{{#grievanceCode}} (grievance {{grievanceCode}}){{/grievanceCode}}{{/forStaff}}{{^forStaff}}We received your support request {{code}}{{/forStaff}}",
    body: `{{#forStaff}}A new support request has been raised{{#requesterName}} by **{{requesterName}}**{{/requesterName}}.\n\n- Reference: {{code}}\n- Subject: {{subject}}{{#categoryLabel}}\n- Category: {{categoryLabel}}{{/categoryLabel}}{{#priorityLabel}}\n- Priority: {{priorityLabel}}{{/priorityLabel}}{{#firstResponseDue}}\n- First response due: {{firstResponseDue}}{{/firstResponseDue}}{{/forStaff}}{{^forStaff}}${HELLO}\n\nThank you for contacting Venkat Sai Global support. Your request **{{subject}}** has been received. Your reference is **{{code}}**.{{#grievanceCode}}\n\nIt has been registered as grievance **{{grievanceCode}}** and will be handled under our grievance redressal process.{{/grievanceCode}}{{#firstResponseDue}}\n\nWe aim to respond by {{firstResponseDue}}.{{/firstResponseDue}}{{/forStaff}}`,
    cta: "View request",
    sample: { recipientName: S.recipientName, code: "VSG-TKT-000123", subject: "Sample subject", firstResponseDue: S.time },
  },
  "support.ticket_reply": {
    subject: "{{#forStaff}}New reply on support request {{code}}{{/forStaff}}{{^forStaff}}New reply on your support request {{code}}{{/forStaff}}",
    body: `{{#forStaff}}{{#authorName}}{{authorName}}{{/authorName}}{{^authorName}}The requester{{/authorName}} replied to support request **{{code}}**{{#subject}} ({{subject}}){{/subject}}.{{/forStaff}}{{^forStaff}}${HELLO}\n\nThere is a new reply on your support request **{{code}}**{{#subject}} ({{subject}}){{/subject}}.{{/forStaff}}{{#excerpt}}\n\n{{excerpt}}{{/excerpt}}{{#isGuest}}\n\nTo add information, contact us again and quote your reference {{code}}.{{/isGuest}}`,
    cta: "View reply",
    sample: { recipientName: S.recipientName, code: "VSG-TKT-000123", subject: "Sample subject", excerpt: "Sample reply text." },
  },
  "support.ticket_resolved": {
    subject: "Your support request {{code}} has been resolved",
    body: `${HELLO}\n\nYour support request **{{code}}**{{#subject}} ({{subject}}){{/subject}} has been marked as resolved.{{#resolution}}\n\nResolution: {{resolution}}{{/resolution}}\n\n{{#isGuest}}If you still need help, contact us again and quote your reference {{code}}.{{/isGuest}}{{^isGuest}}If you still need help, reply to the request and it will be reopened. You can also rate the support you received.{{/isGuest}}`,
    cta: "View request",
    sample: { recipientName: S.recipientName, code: "VSG-TKT-000123", subject: "Sample subject", resolution: "Sample resolution summary." },
  },
  "support.sla_breached": {
    subject: "{{#breached}}Deadline missed{{/breached}}{{^breached}}Deadline close{{/breached}}: support request {{code}}",
    body: "Support request **{{code}}**{{#subject}} ({{subject}}){{/subject}} {{#breached}}has missed its {{deadlineLabel}} deadline{{/breached}}{{^breached}}is close to its {{deadlineLabel}} deadline{{/breached}}{{#dueAt}} ({{dueAt}}){{/dueAt}}.{{#grievanceCode}}\n\nThis is grievance {{grievanceCode}}: statutory timelines apply.{{/grievanceCode}}{{#escalationLevel}}\n\nEscalation level: {{escalationLevel}}{{/escalationLevel}}{{#assigneeName}}\n\nAssigned to: {{assigneeName}}{{/assigneeName}}",
    cta: "Open request",
    sample: { code: "VSG-TKT-000123", subject: "Sample subject", breached: true, deadlineLabel: "first response", dueAt: S.time, escalationLevel: 1 },
  },
  "privacy.request_received": {
    subject: "We received your data request{{#code}} {{code}}{{/code}}",
    body: `${HELLO}\n\nWe have received your request{{#typeLabel}} ({{typeLabel}}){{/typeLabel}}{{#code}}, reference **{{code}}**{{/code}}.{{#dueAt}} We will respond by {{dueAt}}.{{/dueAt}} We may contact you to verify your identity before acting on it.`,
    cta: "View request",
    sample: { recipientName: S.recipientName, code: "VSG-DSR-000123", type: "export", dueAt: "2026-12-07" },
  },
  "privacy.request_completed": {
    subject: "Your data request{{#code}} {{code}}{{/code}} has been completed",
    body: `${HELLO}\n\nYour request{{#typeLabel}} ({{typeLabel}}){{/typeLabel}}{{#code}} {{code}}{{/code}} has been completed.{{#resolution}}\n\n{{resolution}}{{/resolution}}`,
    cta: "View request",
    sample: { recipientName: S.recipientName, code: "VSG-DSR-000123", type: "export" },
  },

  // -------------------------------------------------------------------------
  // Approvals & internal work
  // -------------------------------------------------------------------------
  "approval.submitted": {
    subject: "Awaiting approval: {{title}}",
    body: "{{#type}}{{type}}{{/type}}{{^type}}An item{{/type}} is waiting for review: **{{title}}**{{#code}} ({{code}}){{/code}}.",
    cta: "Open approval",
    sample: { type: "Workforce requirement", title: S.title, code: "VSG-APR-000123" },
  },
  "approval.assigned": {
    subject: "{{#escalated}}Escalated to you{{/escalated}}{{^escalated}}Assigned to you{{/escalated}}: {{title}}",
    body: "Approval request **{{title}}**{{#code}} ({{code}}){{/code}} has been {{#escalated}}escalated{{/escalated}}{{^escalated}}assigned{{/escalated}} to you for review.",
    cta: "Open approval",
    sample: { title: S.title, code: "VSG-APR-000123" },
  },
  "approval.decided": {
    subject: "Your submission was reviewed: {{title}}",
    body: `${HELLO}\n\nYour submission **{{title}}**{{#code}} ({{code}}){{/code}} has been reviewed.{{#decisionLabel}}\n\nDecision: **{{decisionLabel}}**{{/decisionLabel}}{{#reason}}\n\n{{reason}}{{/reason}}`,
    cta: "View details",
    sample: { recipientName: S.recipientName, title: S.title, code: "VSG-APR-000123", decision: "changes_requested", reason: S.reason },
  },
  "work.assigned": {
    subject: "Assigned to you: {{title}}",
    body: "{{#assignedBy}}{{assignedBy}} has assigned you{{/assignedBy}}{{^assignedBy}}You have been assigned{{/assignedBy}} a {{#kindLabel}}{{kindLabel}}{{/kindLabel}}{{^kindLabel}}work item{{/kindLabel}}: **{{title}}**{{#code}} ({{code}}){{/code}}.{{#dueAt}}\n\nDue: {{dueAt}}{{/dueAt}}{{#priority}}\n\nPriority: {{priorityLabel}}{{/priority}}",
    cta: "Open",
    sample: { assignedBy: "Staff member", kindLabel: "support request", title: S.title, code: "VSG-TKT-000123", priority: "high", dueAt: S.time },
  },
  "work.reminder": {
    subject: "{{#overdue}}Overdue{{/overdue}}{{^overdue}}Due soon{{/overdue}}: {{title}}",
    body: "{{#kindLabel}}This {{kindLabel}}{{/kindLabel}}{{^kindLabel}}This item{{/kindLabel}} {{#overdue}}was due{{/overdue}}{{^overdue}}is due{{/overdue}}{{#dueAt}} on {{dueAt}}{{/dueAt}}: **{{title}}**{{#code}} ({{code}}){{/code}}.",
    cta: "Open",
    sample: { kindLabel: "task", title: S.title, dueAt: S.time, overdue: false },
  },

  "org.status_changed": {
    subject: "{{organizationName}} has been {{#statusLabel}}{{statusLabel}}{{/statusLabel}}{{^statusLabel}}updated{{/statusLabel}}",
    body: `${HELLO}\n\nThe status of **{{organizationName}}** on Venkat Sai Global is now **{{#statusLabel}}{{statusLabel}}{{/statusLabel}}{{^statusLabel}}updated{{/statusLabel}}**.{{#reason}}\n\nReason: {{reason}}{{/reason}}\n\nIf you have questions, please contact our support team.`,
    cta: "Open your workspace",
    sample: { recipientName: S.recipientName, organizationName: S.organizationName, status: "suspended", reason: S.reason },
  },
  "partner.licence_reviewed": {
    subject: "Licence review{{#licenceName}}: {{licenceName}}{{/licenceName}}",
    body: `${HELLO}\n\nWe have reviewed {{#licenceName}}the licence **{{licenceName}}**{{/licenceName}}{{^licenceName}}a licence{{/licenceName}}{{#organizationName}} for **{{organizationName}}**{{/organizationName}}.{{#decision}}\n\nDecision: **{{decisionLabel}}**{{/decision}}{{#reason}}\n\n{{reason}}{{/reason}}`,
    cta: "View licences",
    sample: { recipientName: S.recipientName, licenceName: "Recruiting agent licence", organizationName: "Sample agency", decision: "verified" },
  },
  "partner.agreement_issued": {
    subject: "Partner agreement ready for review{{#title}}: {{title}}{{/title}}",
    body: `${HELLO}\n\nA partner agreement{{#title}} (**{{title}}**{{#version}}, version {{version}}{{/version}}){{/title}} is ready for **{{organizationName}}** to review and accept. Please read the terms carefully before accepting.`,
    cta: "Review agreement",
    sample: { recipientName: S.recipientName, title: "Recruitment partner agreement", version: "1", organizationName: "Sample agency" },
  },
  "job.expired": {
    subject: "Job closed: {{jobTitle}}",
    body: "**{{jobTitle}}**{{#code}} ({{code}}){{/code}} has closed because it reached its deadline{{#closedOn}} on {{closedOn}}{{/closedOn}}. Applications already received remain available. You can reopen or repost the job if you are still hiring.",
    cta: "View job",
    sample: { jobTitle: S.jobTitle, code: "VSG-JOB-000123", closedOn: "2026-11-30" },
  },
  "candidate.verification_updated": {
    subject: "Update on your profile verification{{#itemName}}: {{itemName}}{{/itemName}}",
    body: `${HELLO}\n\nWe have reviewed {{#itemName}}**{{itemName}}**{{/itemName}}{{^itemName}}an item{{/itemName}} on your profile.{{#status}}\n\nResult: **{{statusLabel}}**{{/status}}{{#reason}}\n\n{{reason}}{{/reason}}`,
    cta: "View your profile",
    sample: { recipientName: S.recipientName, itemName: "Passport copy", status: "verified" },
  },
  "assessment.cancelled": {
    subject: "Assessment cancelled{{#assessmentName}}: {{assessmentName}}{{/assessmentName}}",
    body: `${HELLO}\n\nYour assessment{{#assessmentName}} **{{assessmentName}}**{{/assessmentName}}{{#scheduledAt}} on {{scheduledAt}}{{/scheduledAt}} has been cancelled.{{#reason}}\n\nReason: {{reason}}{{/reason}}\n\nWe will contact you if it is rescheduled.`,
    cta: "View details",
    sms: "Venkat Sai Global: your assessment{{#assessmentName}} ({{assessmentName}}){{/assessmentName}}{{#scheduledAt}} on {{scheduledAt}}{{/scheduledAt}} has been cancelled.",
    sample: { recipientName: S.recipientName, assessmentName: "Practical trade test", scheduledAt: S.time },
  },
  "assessment.reminder": {
    subject: "Reminder: assessment{{#scheduledAt}} on {{scheduledAt}}{{/scheduledAt}}",
    body: `${HELLO}\n\nThis is a reminder of your assessment{{#assessmentName}} **{{assessmentName}}**{{/assessmentName}}{{#scheduledAt}} on {{scheduledAt}}{{/scheduledAt}}.{{#centreName}}\n\nWhere: {{centreName}}{{/centreName}}{{#address}}, {{address}}{{/address}}\n\nPlease bring a valid photo ID.`,
    cta: "View assessment details",
    sms: "Venkat Sai Global reminder: assessment{{#assessmentName}} ({{assessmentName}}){{/assessmentName}}{{#scheduledAt}} on {{scheduledAt}}{{/scheduledAt}}.",
    sample: { recipientName: S.recipientName, assessmentName: "Practical trade test", scheduledAt: S.time, centreName: "Sample assessment centre" },
  },
  "training.certificate_revoked": {
    subject: "Certificate revoked{{#certificateTitle}}: {{certificateTitle}}{{/certificateTitle}}",
    body: `${HELLO}\n\nYour certificate{{#certificateTitle}} **{{certificateTitle}}**{{/certificateTitle}}{{#code}} ({{code}}){{/code}} has been revoked and is no longer valid.{{#reason}}\n\nReason: {{reason}}{{/reason}}\n\nIf you think this is a mistake, please contact our support team.`,
    cta: "View certificates",
    sample: { recipientName: S.recipientName, certificateTitle: "Sample certificate", code: "VSG-CRT-000123", reason: S.reason },
  },
  "training.enrolment_received": {
    subject: "New enrolment request{{#courseTitle}}: {{courseTitle}}{{/courseTitle}}",
    body: "{{#candidateName}}{{candidateName}}{{/candidateName}}{{^candidateName}}A candidate{{/candidateName}} has asked to enrol{{#courseTitle}} in **{{courseTitle}}**{{/courseTitle}}{{#batchTitle}} ({{batchTitle}}){{/batchTitle}}. Review the request to confirm, waitlist or decline it.",
    cta: "Review enrolment",
    sample: { candidateName: "Candidate name", courseTitle: "Sample course", batchTitle: "Sample batch" },
  },
  "training.enrolment_updated": {
    subject: "Update on your enrolment{{#courseTitle}}: {{courseTitle}}{{/courseTitle}}",
    body: `${HELLO}\n\nYour enrolment{{#courseTitle}} in **{{courseTitle}}**{{/courseTitle}}{{#batchTitle}} ({{batchTitle}}){{/batchTitle}} is now **{{#statusLabel}}{{statusLabel}}{{/statusLabel}}{{^statusLabel}}updated{{/statusLabel}}**.{{#reason}}\n\n{{reason}}{{/reason}}`,
    cta: "View enrolment",
    sample: { recipientName: S.recipientName, courseTitle: "Sample course", batchTitle: "Sample batch", status: "waitlisted" },
  },

  // -------------------------------------------------------------------------
  // Messages & announcements
  // -------------------------------------------------------------------------
  "message.received": {
    subject: "New message{{#subject}}: {{subject}}{{/subject}}",
    body: "{{#senderName}}{{senderName}}{{/senderName}}{{^senderName}}Someone{{/senderName}} sent a new message{{#subject}} in \"{{subject}}\"{{/subject}}.{{#excerpt}}\n\n{{excerpt}}{{/excerpt}}",
    cta: "Read message",
    sample: { senderName: "Sender name", subject: "Sample conversation", excerpt: "Sample message text." },
  },
  "announcement.published": {
    subject: "{{#title}}{{title}}{{/title}}{{^title}}Announcement from Venkat Sai Global{{/title}}",
    body: "{{body}}",
    cta: "Read more",
    sample: { title: "Sample announcement", body: "Sample announcement text." },
  },
};

/** Fallback email button label. */
export const DEFAULT_CTA_LABEL = "Open Venkat Sai Global";

/** Generic template for an event without a code default (keeps dispatch working; the test flags it). */
export function fallbackTemplate(event: NotificationEvent): DefaultTemplate {
  const label = NOTIFICATION_EVENTS[event]?.label ?? "Notification";
  return {
    subject: label,
    body: `${HELLO}\n\n${label}.{{#title}}\n\n**{{title}}**{{/title}}{{#code}} ({{code}}){{/code}}`,
    cta: DEFAULT_CTA_LABEL,
    sample: { recipientName: S.recipientName, title: S.title, code: S.code },
  };
}

export function getDefaultTemplate(event: NotificationEvent): DefaultTemplate {
  return DEFAULT_TEMPLATES[event] ?? fallbackTemplate(event);
}

export function hasDefaultTemplate(event: NotificationEvent): boolean {
  return Boolean(DEFAULT_TEMPLATES[event]);
}
