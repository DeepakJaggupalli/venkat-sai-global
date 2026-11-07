/**
 * First-party analytics event vocabulary (client-safe). Spec §13.2.
 * Use these names with `track()` (client) or `trackServer()` (server conversions).
 * Properties must be non-personal: ids of public objects (job id, service slug), categories,
 * counts, filter names — never names, emails, phone numbers, free-text search of personal data,
 * or anything typed into a form field.
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
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
