/**
 * App paths used in organisation notifications, redirects and revalidation (client-safe).
 * They follow the route contract in src/config/navigation.ts.
 */
import type { OrgType } from "@/db/schema/_constants";

export const ORG_PORTAL_PATH: Record<OrgType, string> = {
  employer: "/employer",
  recruitment_partner: "/recruiter",
  institution: "/institution",
};

/** Profile / verification page of each portal. */
export const ORG_PROFILE_PATH: Record<OrgType, string> = {
  employer: "/employer/company",
  recruitment_partner: "/recruiter/profile",
  institution: "/institution/profile",
};

export const ORG_TEAM_PATH: Record<OrgType, string> = {
  employer: "/employer/team",
  recruitment_partner: "/recruiter/team",
  institution: "/institution/team",
};

export const ADMIN_ORGANIZATIONS_PATH = "/admin/organizations";
/** Command Centre list of partner agreements (owned by the partners area). */
export const ADMIN_PARTNER_AGREEMENTS_PATH = "/admin/partners/agreements";
/** Command Centre list of training institutions (owned by the training area). */
export const ADMIN_TRAINING_INSTITUTIONS_PATH = "/admin/training/institutions";

export function adminOrganizationPath(organizationId: string): string {
  return `${ADMIN_ORGANIZATIONS_PATH}/${organizationId}`;
}

export function invitationPath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`;
}

/** Public employer page (served by the public website). */
export function publicEmployerPath(slug: string): string {
  return `/employers/${encodeURIComponent(slug)}`;
}
