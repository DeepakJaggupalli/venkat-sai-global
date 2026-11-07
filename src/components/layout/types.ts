/**
 * Serialisable prop types shared by the layout shells (client-safe).
 * Server layouts build these from the session/organisation context and pass them to client shells,
 * so they must contain only plain data — and only data the viewer is entitled to see.
 */
import type { PortalKey } from "@/config/navigation";
import type { OrgStatus, OrgType } from "@/db/schema/_constants";

// ---------------------------------------------------------------------------
// Portal shell
// ---------------------------------------------------------------------------

/** The signed-in user as shown in the shell (their own details). */
export type ShellUser = {
  name: string;
  email: string | null;
  phone: string | null;
  /** Avatar image URL, or null to show initials. */
  avatarUrl: string | null;
};

/** A portal the user can open (portal switcher). */
export type PortalLink = { portal: PortalKey; label: string; href: string };

/** The organisation the user is currently working in (org portals). */
export type ShellOrganization = {
  id: string;
  name: string;
  type: OrgType;
  status: OrgStatus;
  /** The viewer's role in this organisation. */
  roleName: string;
};

/** Another organisation of the same type the user belongs to (organisation switcher). */
export type ShellMembership = {
  organizationId: string;
  organizationName: string;
  organizationStatus: OrgStatus;
  roleName: string;
};

/** One breadcrumb step; omit `href` for the current page. */
export type BreadcrumbEntry = { label: string; href?: string };

// ---------------------------------------------------------------------------
// Public website (data will come from the CMS site settings)
// ---------------------------------------------------------------------------

export type PublicNavLink = {
  title: string;
  href: string;
  /** Optional one-line description shown in desktop dropdowns. */
  description?: string;
};

export type PublicNavItem = PublicNavLink & {
  /** Dropdown group. When present the top-level item opens a menu instead of navigating. */
  children?: readonly PublicNavLink[];
};

export type AnnouncementTone = "neutral" | "highlight" | "critical";

export type Announcement = {
  /** Stable id — dismissal is remembered per id in the visitor's browser. */
  id: string;
  message: string;
  href?: string | null;
  linkLabel?: string | null;
  tone?: AnnouncementTone;
  /** Allow visitors to hide it (default true; critical notices should usually be false). */
  dismissible?: boolean;
};

/** Shown in the header instead of "Sign in / Join" when a visitor is signed in. */
export type HeaderAccount = { name: string; href: string; portalLabel: string };

export type FooterLink = { title: string; href: string };

export type FooterColumn = { title: string; links: readonly FooterLink[] };

/** Every field is optional: the footer renders only what is supplied. */
export type FooterContact = {
  address?: string | null;
  email?: string | null;
  /** Display format is kept as supplied; the tel: link strips formatting. */
  phone?: string | null;
  whatsapp?: string | null;
  hours?: string | null;
};

export type SocialPlatform = "linkedin" | "facebook" | "instagram" | "youtube" | "x" | "whatsapp" | "telegram" | "other";

export type SocialLink = { platform: SocialPlatform; href: string; label?: string };
