/**
 * Shell-level portal configuration (client-safe). Route paths here are part of the route contract:
 * each one is (or will be) implemented by the owning portal team.
 */
import type { PortalKey } from "@/config/navigation";
import type { OrgType } from "@/db/schema/_constants";

export type OrgPortalKey = "employer" | "recruiter" | "institution";

export const ORG_PORTALS: readonly OrgPortalKey[] = ["employer", "recruiter", "institution"];

export const ORG_TYPE_BY_PORTAL: Record<OrgPortalKey, OrgType> = {
  employer: "employer",
  recruiter: "recruitment_partner",
  institution: "institution",
};

export const PORTAL_BY_ORG_TYPE: Record<OrgType, OrgPortalKey> = {
  employer: "employer",
  recruitment_partner: "recruiter",
  institution: "institution",
};

/** Help / support page linked from each portal's top bar. */
export const PORTAL_SUPPORT_HREF: Record<PortalKey, string> = {
  talent: "/talent/support",
  employer: "/employer/support",
  recruiter: "/recruiter/support",
  institution: "/institution/support",
  admin: "/admin/support",
};

/** Where "View all notifications" goes. Business portals share the account notification centre. */
export const PORTAL_NOTIFICATIONS_HREF: Record<PortalKey, string> = {
  talent: "/talent/notifications",
  employer: "/account/notifications",
  recruiter: "/account/notifications",
  institution: "/account/notifications",
  admin: "/account/notifications",
};

/** Organisation verification page per org portal (status banner links here). */
export const VERIFICATION_HREF: Record<OrgPortalKey, string> = {
  employer: "/employer/company/verification",
  recruiter: "/recruiter/profile/verification",
  institution: "/institution/profile/verification",
};

/** What members call their organisation in each portal (used in copy). */
export const ORG_NOUN: Record<OrgPortalKey, string> = {
  employer: "company",
  recruiter: "agency",
  institution: "institution",
};

/** In-app notification summary (built by the notifications module). */
export const NOTIFICATION_SUMMARY_ENDPOINT = "/api/v1/notifications/summary";

/** Cookie remembering the desktop sidebar state ("collapsed" | "expanded"). */
export const SIDEBAR_COOKIE = "vsg_sidebar";

/** Cookie remembering the last portal visited (account area "Back to …" link). */
export const LAST_PORTAL_COOKIE = "vsg_last_portal";

export const PUBLIC_CTA = {
  signIn: "/sign-in",
  join: "/sign-up",
  postRequirement: "/employers/request",
} as const;

/** Legal links required in the public footer (labels/paths can be overridden from the CMS). */
export const DEFAULT_LEGAL_LINKS = [
  { title: "Privacy policy", href: "/legal/privacy-policy" },
  { title: "Terms of use", href: "/legal/terms" },
  { title: "Cookie preferences", href: "/cookie-preferences" },
  { title: "Your data rights", href: "/legal/data-rights" },
  { title: "Accessibility", href: "/legal/accessibility" },
  { title: "Grievance redressal", href: "/grievance" },
] as const;

export function isOrgPortal(portal: PortalKey): portal is OrgPortalKey {
  return (ORG_PORTALS as readonly string[]).includes(portal);
}
