import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarPlus,
  ClipboardCheck,
  CreditCard,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Target,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { ChartDatum, ChecklistItem, DashboardAction, QuickActionItem } from "@/components/dashboard";
import type { InstitutionPermission } from "@/config/permissions";

/**
 * Institution Portal dashboard: which buttons a member sees, the set-up checklist and the chart series.
 * Pure and client-safe so the rules are unit tested; the page passes real counts from the database.
 */

type Permissions = ReadonlySet<string> | readonly string[];

const has = (permissions: Permissions, key: InstitutionPermission | undefined): boolean =>
  key === undefined || (Array.isArray(permissions) ? permissions.includes(key) : (permissions as ReadonlySet<string>).has(key));

/** Real counts shown as badges on the quick actions (0 or null hides a badge). */
export type InstitutionActionBadges = {
  applicationsToReview?: number | null;
  resultsToPublish?: number | null;
  readyForCertificate?: number | null;
  upcomingDrives?: number | null;
  pendingInvitations?: number | null;
  unreadMessages?: number | null;
  openSupportRequests?: number | null;
};

type ActionDef = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
  /** Needed to see the button (none: every member). */
  permission?: InstitutionPermission;
  badge?: keyof InstitutionActionBadges;
  badgeLabel?: string;
  /** Where the button goes while its badge shows a count (straight to the waiting items). */
  badgeHref?: string;
};

/** Every main button of the Institution Portal, in the order of a training year. */
export const INSTITUTION_ACTIONS: readonly ActionDef[] = [
  { key: "course", label: "Add a course", href: "/institution/courses/new", icon: BookOpen, hint: "Syllabus, fees and eligibility", permission: "institution.courses.manage" },
  { key: "batch", label: "New batch", href: "/institution/batches/new", icon: CalendarPlus, hint: "Dates, seats and instructors", permission: "institution.batches.manage" },
  {
    key: "students",
    label: "Students",
    href: "/institution/students",
    icon: Users,
    hint: "Confirm applicants, mark attendance",
    permission: "institution.students.manage",
    badge: "applicationsToReview",
    badgeLabel: "to review",
    badgeHref: "/institution/students?status=applied",
  },
  {
    key: "assessment",
    label: "Record assessment",
    href: "/institution/assessments?view=unpublished",
    icon: ClipboardCheck,
    hint: "Enter scores and publish results",
    permission: "institution.assessments.manage",
    badge: "resultsToPublish",
    badgeLabel: "results to publish",
  },
  {
    key: "certificates",
    label: "Issue certificates",
    href: "/institution/certificates",
    icon: Award,
    hint: "For learners who completed",
    permission: "institution.certificates.issue",
    badge: "readyForCertificate",
    badgeLabel: "ready",
  },
  {
    key: "placements",
    label: "Placements",
    href: "/institution/placements",
    icon: Target,
    hint: "Campus drives, internships, jobs",
    permission: "institution.placements.manage",
    badge: "upcomingDrives",
    badgeLabel: "upcoming drives",
  },
  { key: "reports", label: "Reports", href: "/institution/reports", icon: BarChart3, hint: "Pass, attendance and placement rates", permission: "institution.reports.view" },
  { key: "profile", label: "Profile and verification", href: "/institution/profile", icon: Building2, hint: "Details, documents, verification", permission: "institution.profile.manage" },
  { key: "announcements", label: "Announcements", href: "/institution/announcements", icon: Megaphone, hint: "Share news on Venkat Sai", permission: "institution.profile.manage" },
  {
    key: "team",
    label: "Team",
    href: "/institution/team",
    icon: UserPlus,
    hint: "Invite staff, set roles",
    permission: "institution.team.manage",
    badge: "pendingInvitations",
    badgeLabel: "invitations pending",
  },
  { key: "billing", label: "Billing", href: "/institution/billing", icon: CreditCard, hint: "Plan, invoices and payments", permission: "institution.billing.manage" },
  { key: "messages", label: "Messages", href: "/institution/messages", icon: MessageSquare, hint: "Talk to the Venkat Sai team", badge: "unreadMessages", badgeLabel: "unread", badgeHref: "/institution/messages?view=unread" },
  { key: "support", label: "Support", href: "/institution/support", icon: LifeBuoy, hint: "Ask for help, track requests", badge: "openSupportRequests", badgeLabel: "open" },
];

/**
 * The quick actions this member may use, with real count badges. `omit` leaves out buttons the page already
 * offers elsewhere (the full dashboard links the profile from its verification card).
 */
export function institutionQuickActions(permissions: Permissions, badges: InstitutionActionBadges = {}, opts: { omit?: readonly string[] } = {}): QuickActionItem[] {
  const omit = new Set(opts.omit ?? []);
  return INSTITUTION_ACTIONS.filter((a) => !omit.has(a.key) && has(permissions, a.permission)).map(({ label, href, icon, hint, badge, badgeLabel, badgeHref }) => {
    const raw = badge ? badges[badge] : null;
    const count = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    return { label, href: count && badgeHref ? badgeHref : href, icon, hint, badge: count, badgeLabel };
  });
}

/** Up to two header pills: the first two training actions this member may use. */
export function institutionHeaderActions(permissions: Permissions): DashboardAction[] {
  const order = ["course", "batch", "students", "assessment", "placements", "reports"];
  return order
    .map((key) => INSTITUTION_ACTIONS.find((a) => a.key === key)!)
    .filter((a) => has(permissions, a.permission))
    .slice(0, 2)
    .map((a) => ({ label: a.label, href: a.href, icon: a.icon }));
}

export type SetupFacts = {
  profileComplete: boolean;
  documentsUploaded: boolean;
  verified: boolean;
  hasCourse: boolean;
  hasBatch: boolean;
};

/**
 * Set-up steps that unlock publishing courses and issuing certificates. A step is only listed for members who
 * can do it (a coordinator does not see the profile steps, an instructor sees none).
 */
export function institutionSetupChecklist(permissions: Permissions, facts: SetupFacts): ChecklistItem[] {
  const items: (ChecklistItem & { permission: InstitutionPermission })[] = [
    {
      id: "profile",
      label: "Complete the institution profile",
      description: "Kind of institution, city and a contact email or phone.",
      done: facts.profileComplete,
      href: "/institution/profile",
      permission: "institution.profile.manage",
    },
    {
      id: "documents",
      label: "Upload registration and accreditation documents",
      description: "Private to the Venkat Sai verification team.",
      done: facts.documentsUploaded,
      href: "/institution/profile#documents",
      permission: "institution.profile.manage",
    },
    {
      id: "verified",
      label: "Get verified by Venkat Sai",
      description: "Needed to publish courses and issue certificates.",
      done: facts.verified,
      href: "/institution/profile#verification",
      permission: "institution.profile.manage",
    },
    { id: "course", label: "Create your first course", description: "Add the syllabus, fees and who can join.", done: facts.hasCourse, href: "/institution/courses/new", permission: "institution.courses.manage" },
    { id: "batch", label: "Schedule a batch", description: "Pick dates and seats so learners can apply.", done: facts.hasBatch, href: "/institution/batches/new", permission: "institution.batches.manage" },
  ];
  return items.filter((i) => has(permissions, i.permission)).map(({ id, label, description, done, href }) => ({ id, label, description, done, href }));
}

// ---------------------------------------------------------------------------
// Chart series
// ---------------------------------------------------------------------------

export type MonthBucket = { key: string; label: string };

const MONTH_KEY = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" });
const MONTH_LABEL = (timeZone: string) => new Intl.DateTimeFormat("en-IN", { timeZone, month: "short" });

/** "YYYY-MM" of `date` in `timeZone`. */
export function monthKeyIn(date: Date, timeZone = "Asia/Kolkata"): string {
  const parts = MONTH_KEY(timeZone).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** The last `count` calendar months up to and including the month of `now` (oldest first), in `timeZone`. */
export function lastMonths(now: Date, count = 6, timeZone = "Asia/Kolkata"): MonthBucket[] {
  const [y, m] = monthKeyIn(now, timeZone).split("-").map(Number) as [number, number];
  const buckets: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const index = y * 12 + (m - 1) - i;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    // Mid-month UTC noon: the same calendar month in every time zone.
    const mid = new Date(Date.UTC(year, month - 1, 15, 12));
    buckets.push({ key: `${year}-${String(month).padStart(2, "0")}`, label: MONTH_LABEL(timeZone).format(mid) });
  }
  return buckets;
}

/** One value per month bucket (missing months are 0; rows outside the buckets are ignored). */
export function monthlySeries(buckets: readonly MonthBucket[], rows: readonly { month: string; value: number }[]): ChartDatum[] {
  const byMonth = new Map<string, number>();
  for (const row of rows) byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + (Number.isFinite(row.value) ? row.value : 0));
  return buckets.map((b) => ({ label: b.label, value: byMonth.get(b.key) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

/** Seats left in batches that are still enrolling, from capacity and confirmed counts (never below zero). */
export function seatsLeft(seats: { capacity: number; filled: number }): number {
  return Math.max(0, seats.capacity - seats.filled);
}

/** "12 of 20 seats" / "12 enrolled" (no seat limit). */
export function seatLine(enrolled: number, capacity: number | null): string {
  return capacity ? `${enrolled} of ${capacity} seats` : `${enrolled} enrolled`;
}

/** Fill percentage for a seat bar (0–100), or null when the batch has no seat limit. */
export function seatPercent(enrolled: number, capacity: number | null): number | null {
  if (!capacity || capacity <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((enrolled / capacity) * 100)));
}

// ---------------------------------------------------------------------------
// Links and verification
// ---------------------------------------------------------------------------

/**
 * `href` when the member may open the page behind it (any one of `permission`), otherwise null so a tile or row
 * is shown without a link instead of leading to a "no access" page.
 */
export function linkIf(permissions: Permissions, permission: InstitutionPermission | readonly InstitutionPermission[] | undefined, href: string): string | null {
  if (permission === undefined) return href;
  const keys: readonly InstitutionPermission[] = typeof permission === "string" ? [permission] : permission;
  return keys.some((k) => has(permissions, k)) ? href : null;
}

/** Pages that list batches: coordinators see all, instructors their own. */
export const BATCH_VIEW_PERMISSIONS: readonly InstitutionPermission[] = ["institution.batches.manage", "institution.students.manage", "institution.assessments.manage"];

/**
 * Whose batches the dashboard counts. Instructors (student or assessment work without
 * institution.batches.manage) see the batches they are assigned to, as everywhere else in the portal; coordinators
 * and overview roles (viewer, placements) see the whole institution.
 */
export function seesOwnBatchesOnly(permissions: Permissions): boolean {
  if (has(permissions, "institution.batches.manage")) return false;
  return has(permissions, "institution.students.manage") || has(permissions, "institution.assessments.manage");
}

export type VerificationTone = "success" | "info" | "warning" | "danger" | "neutral";

export type VerificationSummary = { label: string; tone: VerificationTone; text: string; needsAction: boolean };

/** Plain-English verification state for the dashboard (organisation status plus days until it lapses). */
export function verificationSummary(status: string, opts: { daysLeft?: number | null } = {}): VerificationSummary {
  switch (status) {
    case "verified": {
      const days = opts.daysLeft;
      if (typeof days === "number" && days <= 60) {
        return {
          label: "Verified",
          tone: days <= 14 ? "warning" : "success",
          text: days <= 0 ? "Your verification ends today. Submit again from your profile." : `Your verification ends in ${days} day${days === 1 ? "" : "s"}. Submit again from your profile to renew it.`,
          needsAction: true,
        };
      }
      return { label: "Verified", tone: "success", text: "Learners and employers see your institution as verified by Venkat Sai.", needsAction: false };
    }
    case "pending":
    case "under_review":
      return { label: "In review", tone: "info", text: "Venkat Sai is checking your details and documents. We will let you know when it is done.", needsAction: false };
    case "rejected":
      return { label: "Not approved", tone: "danger", text: "Verification was not approved. See the reason on your profile, fix it and submit again.", needsAction: true };
    case "suspended":
      return { label: "Suspended", tone: "danger", text: "Your institution is suspended. Contact Venkat Sai support to find out what is needed.", needsAction: true };
    case "expired":
      return { label: "Expired", tone: "warning", text: "Your verification has ended. Submit again to keep publishing courses and issuing certificates.", needsAction: true };
    default:
      return { label: "Not verified yet", tone: "neutral", text: "Complete your profile and upload your documents, then submit them for verification.", needsAction: true };
  }
}

/** A whole-number percentage for a rate bar (0–100), or null when there is nothing to divide by. */
export function ratePercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)));
}
