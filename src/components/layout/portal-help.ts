/**
 * "How to use" guide of each portal (client-safe): the top bar "?" button and the "How to use" nav item link
 * here. Pages: src/app/<portal>/help (the /agency guide is served by /employer/help through the proxy rewrite).
 */
import type { PortalKey } from "@/config/navigation";

export const PORTAL_HELP_HREF: Record<PortalKey, string> = {
  talent: "/talent/help",
  employer: "/employer/help",
  agency: "/agency/help",
  recruiter: "/recruiter/help",
  institution: "/institution/help",
  admin: "/admin/help",
};
