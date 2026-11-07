/**
 * Copy for the organisation status banner shown in org portals until the organisation is verified
 * (client-safe, pure). Wording is deliberately factual: it describes what the member can do next,
 * without promising timelines or outcomes.
 */
import type { OrgStatus } from "@/db/schema/_constants";

import { ORG_NOUN, PORTAL_SUPPORT_HREF, VERIFICATION_HREF, type OrgPortalKey } from "./portal-config";

export type OrgStatusTone = "info" | "warning" | "danger";

export type OrgStatusAction = { label: string; href: string };

export type OrgStatusNotice = {
  status: Exclude<OrgStatus, "verified">;
  tone: OrgStatusTone;
  title: string;
  description: string;
  primary: OrgStatusAction;
  secondary?: OrgStatusAction;
};

/** Null when no banner is needed (verified organisations). */
export function getOrgStatusNotice(status: OrgStatus, portal: OrgPortalKey): OrgStatusNotice | null {
  const noun = ORG_NOUN[portal];
  const verification = VERIFICATION_HREF[portal];
  const locked = `Some features stay unavailable until your ${noun} is verified.`;

  switch (status) {
    case "verified":
      return null;
    case "draft":
      return {
        status,
        tone: "warning",
        title: `Verify your ${noun} to unlock every feature`,
        description: `Your ${noun} has not been submitted for verification yet. Add your details and documents so the Venkat Sai team can review them. ${locked}`,
        primary: { label: "Start verification", href: verification },
      };
    case "pending":
      return {
        status,
        tone: "info",
        title: "Verification request received",
        description: `Your request is waiting for review by the Venkat Sai team, and the outcome will appear on your verification page. ${locked}`,
        primary: { label: "View verification status", href: verification },
      };
    case "under_review":
      return {
        status,
        tone: "info",
        title: "Verification in progress",
        description: `The Venkat Sai team is reviewing your ${noun}'s details and documents and will contact you if anything else is needed. ${locked}`,
        primary: { label: "View verification status", href: verification },
      };
    case "rejected":
      return {
        status,
        tone: "danger",
        title: "Verification was not approved",
        description: `See the reasons on your verification page, update your details and submit again. ${locked}`,
        primary: { label: "Review and resubmit", href: verification },
      };
    case "suspended":
      return {
        status,
        tone: "danger",
        title: `Your ${noun} account is suspended`,
        description: `Features that need an active, verified account are unavailable while your ${noun} is suspended. Contact Venkat Sai support to find out what is needed to restore access.`,
        primary: { label: "Contact support", href: PORTAL_SUPPORT_HREF[portal] },
        secondary: { label: "Verification details", href: verification },
      };
    case "expired":
      return {
        status,
        tone: "warning",
        title: "Verification has expired",
        description: `Your ${noun}'s verification is no longer current. Renew it to keep using features that require a verified ${noun}.`,
        primary: { label: "Renew verification", href: verification },
      };
    default: {
      // Exhaustiveness guard: a new status must get its own copy.
      const unknown: never = status;
      return unknown;
    }
  }
}
