/** Enquiry types offered on the contact form (grievances have their own page, /grievance). Client-safe. */
export type ContactEnquiryType = "general" | "employer" | "partner" | "institution" | "candidate_support" | "media" | "careers";

export const CONTACT_TYPE_OPTIONS: { value: ContactEnquiryType; label: string; hint: string }[] = [
  { value: "general", label: "General enquiry", hint: "Anything else you would like to ask us." },
  { value: "employer", label: "Hiring / employer services", hint: "Recruitment, overseas hiring, bulk manpower or testing for your organisation." },
  { value: "partner", label: "Recruitment partnership", hint: "For licensed recruitment agencies interested in working with us." },
  { value: "institution", label: "Training institution partnership", hint: "For training institutes and colleges." },
  { value: "candidate_support", label: "Help as a candidate", hint: "Questions about jobs, applications or your profile." },
  { value: "media", label: "Media enquiry", hint: "Press and media requests." },
  { value: "careers", label: "Careers at Venkat Sai", hint: "Working for Venkat Sai Global itself." },
];

export const CONTACT_TYPE_VALUES = CONTACT_TYPE_OPTIONS.map((o) => o.value);
