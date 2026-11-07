/**
 * First-party analytics event vocabulary (client-safe). Spec §13.2.
 * Use these names with `track()` (client) or `trackServer()` (server conversions).
 * Properties must be non-personal: ids of public objects (job id, service slug), categories,
 * counts, filter names — never names, emails, phone numbers, free-text search of personal data,
 * or anything typed into a form field. The collector drops property keys and values that look
 * personal (see `sanitizeEventProps` in ./privacy-rules.ts).
 */
export const ANALYTICS_EVENTS = [
  "page_view",
  "nav_click",
  "cta_click",
  "service_view",
  "industry_view",
  "country_view",
  "job_view",
  "job_search",
  "filter_applied",
  "job_saved",
  "job_shared",
  "registration_started",
  "registration_completed",
  "login_completed",
  "profile_completed",
  "application_started",
  "application_submitted",
  "employer_enquiry_opened",
  "employer_enquiry_submitted",
  "requirement_submitted",
  "recruiter_registration_started",
  "recruiter_application_submitted",
  "institution_registration_started",
  "contact_form_submitted",
  "course_viewed",
  "course_enrolment_started",
  "course_enrolment_completed",
  "form_started",
  "form_submitted",
  "scroll_depth",
  "outbound_click",
  "file_download",
  "error_shown",
  /** An organisation submitted its verification documents (props: { orgType }). */
  "organization_verification_submitted",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const EVENT_SET: ReadonlySet<string> = new Set(ANALYTICS_EVENTS);

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === "string" && EVENT_SET.has(value);
}

/**
 * Key events counted as conversions in dashboards and daily roll-ups (`conversions:<event>`).
 * Record each conversion once: either from the browser (`track`) or from the server (`trackServer`).
 */
export const CONVERSION_EVENTS = [
  "registration_completed",
  "application_submitted",
  "employer_enquiry_submitted",
  "requirement_submitted",
  "recruiter_application_submitted",
  "contact_form_submitted",
  "course_enrolment_completed",
  "organization_verification_submitted",
] as const satisfies readonly AnalyticsEvent[];

export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];

/** Human labels for admin dashboards. */
export const ANALYTICS_EVENT_LABELS: Record<AnalyticsEvent, string> = {
  page_view: "Page view",
  nav_click: "Navigation click",
  cta_click: "Call-to-action click",
  service_view: "Service viewed",
  industry_view: "Industry viewed",
  country_view: "Country viewed",
  job_view: "Job viewed",
  job_search: "Job search",
  filter_applied: "Filter applied",
  job_saved: "Job saved",
  job_shared: "Job shared",
  registration_started: "Registration started",
  registration_completed: "Registration completed",
  login_completed: "Signed in",
  profile_completed: "Profile completed",
  application_started: "Application started",
  application_submitted: "Application submitted",
  employer_enquiry_opened: "Employer enquiry opened",
  employer_enquiry_submitted: "Employer enquiry submitted",
  requirement_submitted: "Workforce requirement submitted",
  recruiter_registration_started: "Partner registration started",
  recruiter_application_submitted: "Partner application submitted",
  institution_registration_started: "Institution registration started",
  contact_form_submitted: "Contact form submitted",
  course_viewed: "Course viewed",
  course_enrolment_started: "Course enrolment started",
  course_enrolment_completed: "Course enrolment completed",
  form_started: "Form started",
  form_submitted: "Form submitted",
  scroll_depth: "Scroll depth",
  outbound_click: "Outbound link click",
  file_download: "File download",
  error_shown: "Error shown",
  organization_verification_submitted: "Verification submitted",
};
