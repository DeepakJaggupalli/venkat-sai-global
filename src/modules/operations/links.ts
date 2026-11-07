/**
 * Route contract for operations records (client-safe). Notification links and UI teams use these builders,
 * so every portal links to the same pages:
 *
 *   /admin/leads/[id]                 lead detail             /admin/leads/enquiries/[id]   enquiry detail
 *   /admin/requirements/[id]          requirement (staff)     /employer/requirements/[id]   requirement (employer)
 *   /admin/support/[id]               ticket (staff)          /<portal>/support/[id]        ticket (requester)
 *   /admin/messages/[id]              thread (staff)          /<portal>/messages/[id]       thread (org member / candidate)
 *   /admin/tasks                      staff task list (falls back to the related record when known)
 */
import type { OrgType, Portal } from "@/db/schema/_constants";

const PORTAL_PATH: Record<Exclude<Portal, "public">, string> = {
  talent: "/talent",
  employer: "/employer",
  recruiter: "/recruiter",
  institution: "/institution",
  admin: "/admin",
};

export const ORG_PORTAL_BY_TYPE: Record<OrgType, "employer" | "recruiter" | "institution"> = {
  employer: "employer",
  recruitment_partner: "recruiter",
  institution: "institution",
};

export const staffLeadHref = (id: string): string => `/admin/leads/${id}`;
export const staffEnquiryHref = (id: string): string => `/admin/leads/enquiries/${id}`;
export const staffRequirementHref = (id: string): string => `/admin/requirements/${id}`;
export const employerRequirementHref = (id: string): string => `/employer/requirements/${id}`;
export const staffTicketHref = (id: string): string => `/admin/support/${id}`;
export const staffThreadHref = (id: string): string => `/admin/messages/${id}`;
export const STAFF_TASKS_HREF = "/admin/tasks";

/** Requester view of a ticket; null for guests (no account — they are answered by email). */
export function requesterTicketHref(portal: Portal, id: string, hasAccount: boolean): string | null {
  if (!hasAccount) return null;
  const base = portal === "public" ? PORTAL_PATH.talent : PORTAL_PATH[portal];
  return `${base}/support/${id}`;
}

/** Thread page for a participant in a portal (org members by organisation type, candidates in the People Portal). */
export function threadHrefFor(capacity: { kind: "staff" } | { kind: "org"; orgType: OrgType } | { kind: "user" }, id: string): string {
  if (capacity.kind === "staff") return staffThreadHref(id);
  if (capacity.kind === "org") return `${PORTAL_PATH[ORG_PORTAL_BY_TYPE[capacity.orgType]]}/messages/${id}`;
  return `${PORTAL_PATH.talent}/messages/${id}`;
}

/** Best staff page for a record an internal task points at. */
export function staffRelatedHref(relatedType: string | null | undefined, relatedId: string | null | undefined): string {
  if (!relatedType || !relatedId) return STAFF_TASKS_HREF;
  switch (relatedType) {
    case "lead":
      return staffLeadHref(relatedId);
    case "enquiry":
      return staffEnquiryHref(relatedId);
    case "requirement":
      return staffRequirementHref(relatedId);
    case "ticket":
      return staffTicketHref(relatedId);
    case "organization":
      return `/admin/organizations/${relatedId}`;
    case "candidate":
      return `/admin/candidates/${relatedId}`;
    case "job":
      return `/admin/jobs/${relatedId}`;
    default:
      return STAFF_TASKS_HREF;
  }
}
