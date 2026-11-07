/**
 * Per-portal billing configuration (client-safe). The `portal` value is the hidden field the commercial
 * module's portal actions expect.
 */
import type { OrgType } from "@/db/schema/_constants";
import { BILLING_MANAGE_PERMISSION, BILLING_VIEW_PERMISSION, PORTAL_BILLING_PATH } from "@/modules/commercial/constants";

export type BillingPortal = "employer" | "recruiter" | "institution";

export const BILLING_PORTALS: Record<BillingPortal, { orgType: OrgType; base: string; home: string; homeLabel: string; viewPermission: string; managePermission: string }> = {
  employer: {
    orgType: "employer",
    base: PORTAL_BILLING_PATH.employer,
    home: "/employer",
    homeLabel: "Employer Portal",
    viewPermission: BILLING_VIEW_PERMISSION.employer,
    managePermission: BILLING_MANAGE_PERMISSION.employer,
  },
  recruiter: {
    orgType: "recruitment_partner",
    base: PORTAL_BILLING_PATH.recruitment_partner,
    home: "/recruiter",
    homeLabel: "Partner Portal",
    viewPermission: BILLING_VIEW_PERMISSION.recruitment_partner,
    managePermission: BILLING_MANAGE_PERMISSION.recruitment_partner,
  },
  institution: {
    orgType: "institution",
    base: PORTAL_BILLING_PATH.institution,
    home: "/institution",
    homeLabel: "Institution Portal",
    viewPermission: BILLING_VIEW_PERMISSION.institution,
    managePermission: BILLING_MANAGE_PERMISSION.institution,
  },
};

export function billingTabs(portal: BillingPortal): { href: string; label: string; match?: "exact" | "prefix" }[] {
  const base = BILLING_PORTALS[portal].base;
  return [
    { href: base, label: "Plan and usage", match: "exact" },
    { href: `${base}/invoices`, label: "Invoices", match: "prefix" },
    { href: `${base}/payments`, label: "Payments", match: "prefix" },
    { href: `${base}/details`, label: "Billing details", match: "prefix" },
  ];
}
