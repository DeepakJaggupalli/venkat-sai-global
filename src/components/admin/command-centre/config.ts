/**
 * Command Centre home (/admin): which buttons and figures each staff member sees, plus the small date helpers the
 * dashboard queries use. Client-safe and pure (no database), so the permission rules are unit-tested on their own.
 *
 * Rule: a button or figure shows only when the viewer can open the page behind it (the same permission the page's
 * requireStaff() checks), so nobody is sent to a "no access" screen from the dashboard.
 */
import {
  BarChart3,
  CalendarCheck2,
  DatabaseBackup,
  FileSpreadsheet,
  FileUser,
  Gift,
  GraduationCap,
  HardHat,
  Headset,
  LayoutTemplate,
  ListChecks,
  Mail,
  Megaphone,
  ReceiptText,
  Settings,
  Star,
  UserCog,
  UserSearch,
  type LucideIcon,
} from "lucide-react";

import type { PlatformPermission } from "@/config/permissions";

export type PermissionRule = {
  permission?: PlatformPermission | readonly PlatformPermission[];
  mode?: "all" | "any";
};

/** Same rule as staffCan(): no permission = everyone; a list needs all of them unless mode is "any". */
export function allows(permissions: ReadonlySet<string>, rule: PermissionRule): boolean {
  const { permission, mode = "all" } = rule;
  if (!permission) return true;
  const list: readonly string[] = typeof permission === "string" ? [permission] : permission;
  if (list.length === 0) return true;
  return mode === "all" ? list.every((p) => permissions.has(p)) : list.some((p) => permissions.has(p));
}

export function filterAllowed<T extends PermissionRule>(items: readonly T[], permissions: ReadonlySet<string>): T[] {
  return items.filter((item) => allows(permissions, item));
}

// ---------------------------------------------------------------------------
// Quick actions: every main button of the Command Centre
// ---------------------------------------------------------------------------

/** Keys of the figures that can put a count badge on a button. */
export type ActionBadgeKey = "cvsToCall" | "requirementsToReview" | "approvals" | "reviewsPending" | "referralsDue" | "newEnquiries" | "supportOpen";

export type CommandCentreAction = PermissionRule & {
  key: string;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  /** Real count shown on the card ("3 waiting"). */
  badge?: ActionBadgeKey;
  badgeLabel?: string;
};

/** In the order the office uses them most. Each permission matches the requireStaff() of the page it opens. */
export const COMMAND_CENTRE_ACTIONS: readonly CommandCentreAction[] = [
  {
    key: "post-requirement",
    label: "Post a requirement",
    hint: "Poster photo, country and trades. Works from your phone.",
    href: "/admin/requirements/posters/new",
    icon: Megaphone,
    permission: ["content.edit", "media.manage"],
  },
  {
    key: "cvs",
    label: "Applicants and CVs",
    hint: "Call back, WhatsApp and set each person's status.",
    href: "/admin/cv-submissions",
    icon: FileUser,
    permission: "candidates.view",
    badge: "cvsToCall",
    badgeLabel: "to call back",
  },
  {
    key: "import-cvs",
    label: "Import CVs from Excel",
    hint: "Add a whole sheet of CVs in one go.",
    href: "/admin/cv-submissions/import",
    icon: FileSpreadsheet,
    permission: "candidates.manage",
  },
  {
    key: "matching-cvs",
    label: "Matching CVs",
    hint: "Open a live poster to see the CVs that fit it.",
    href: "/admin/requirements/posters?status=published",
    icon: UserSearch,
    permission: ["content.view", "candidates.view"],
  },
  {
    key: "requirements",
    label: "Manpower requests",
    hint: "Requirements sent by companies and travel agencies.",
    href: "/admin/requirements",
    icon: HardHat,
    permission: "requirements.view",
    badge: "requirementsToReview",
    badgeLabel: "to review",
  },
  {
    key: "bookings",
    label: "Test and training bookings",
    hint: "Dates, seats and who is coming.",
    href: "/admin/bookings",
    icon: CalendarCheck2,
    permission: "recruitment.assessments",
  },
  {
    key: "approvals",
    label: "Approval centre",
    hint: "Verifications and jobs waiting for a decision.",
    href: "/admin/approvals",
    icon: ListChecks,
    permission: "approvals.view",
    badge: "approvals",
    badgeLabel: "waiting",
  },
  {
    key: "worker-invoice",
    label: "New worker invoice",
    hint: "Bill an agency or company for the workers you supplied.",
    href: "/admin/commercial/worker-invoices/new",
    icon: ReceiptText,
    permission: "commercial.invoices",
  },
  {
    key: "reviews",
    label: "Worker reviews",
    hint: "Approve reviews before they show on the website.",
    href: "/admin/reviews?tab=pending",
    icon: Star,
    permission: "candidates.manage",
    badge: "reviewsPending",
    badgeLabel: "to approve",
  },
  {
    key: "referrals",
    label: "Referrals",
    hint: "Rewards due for friends who flew out.",
    href: "/admin/referrals",
    icon: Gift,
    permission: "candidates.manage",
    badge: "referralsDue",
    badgeLabel: "rewards due",
  },
  {
    key: "leads",
    label: "Leads and enquiries",
    hint: "New business and questions from the website.",
    href: "/admin/leads",
    icon: Mail,
    permission: "leads.view",
    badge: "newEnquiries",
    badgeLabel: "new enquiries",
  },
  {
    key: "support",
    label: "Support desk",
    hint: "Reply to people who asked for help.",
    href: "/admin/support",
    icon: Headset,
    permission: "support.view",
    badge: "supportOpen",
    badgeLabel: "open",
  },
  {
    key: "training-batches",
    label: "Training batches",
    hint: "Batches, seats and students.",
    href: "/admin/training/batches",
    icon: GraduationCap,
    permission: ["training.view", "training.manage"],
    mode: "any",
  },
  {
    key: "content",
    label: "Content and homepage",
    hint: "Edit the website, homepage and posters.",
    href: "/admin/content/homepage",
    icon: LayoutTemplate,
    permission: "content.view",
  },
  {
    key: "users",
    label: "Users and roles",
    hint: "Staff accounts and what each person can open.",
    href: "/admin/users",
    icon: UserCog,
    permission: "users.view",
  },
  {
    key: "settings",
    label: "Settings",
    hint: "Company details, lists and modules.",
    href: "/admin/settings",
    icon: Settings,
    permission: "settings.view",
  },
  {
    key: "backup",
    label: "Backup",
    hint: "Download a full copy of your data.",
    href: "/admin/system/backup",
    icon: DatabaseBackup,
    permission: "settings.security",
  },
  {
    key: "owner-overview",
    label: "Owner overview",
    hint: "The business over the last 7, 30 or 90 days.",
    href: "/admin/overview",
    icon: BarChart3,
    permission: "dashboard.view",
  },
];

/** Keys of the up-to-three pills in the dashboard header, in order of preference. */
export const HEADER_ACTION_KEYS = ["post-requirement", "cvs", "owner-overview", "requirements", "approvals", "support"] as const;

export function headerActions(actions: readonly CommandCentreAction[]): CommandCentreAction[] {
  const byKey = new Map(actions.map((a) => [a.key, a]));
  return HEADER_ACTION_KEYS.flatMap((key) => byKey.get(key) ?? []).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Which figures the viewer may see (each one matches the page its tile opens)
// ---------------------------------------------------------------------------

export type CommandCentreAccess = {
  /** CV counts, passports, charts, latest CVs (Applicants and CVs: candidates.view). */
  cvs: boolean;
  /** Reviews to approve and referral rewards due (candidates.manage). */
  candidateCare: boolean;
  /** Open requirement posters (content.view). */
  posters: boolean;
  /** Poster applicant lists (content.view + candidates.view). */
  posterApplicants: boolean;
  /** Manpower requests (requirements.view). */
  requirements: boolean;
  /** Test and training dates (recruitment.assessments). */
  bookings: boolean;
  approvals: boolean;
  jobs: boolean;
  support: boolean;
  /** Grievance enquiries and the grievance count (support.grievances). */
  grievances: boolean;
  leads: boolean;
  money: boolean;
  /** Companies, partners and institutions (orgs.view). */
  orgs: boolean;
  /** Placements (recruitment.mobilisation). */
  mobilisation: boolean;
  /** Owner set-up checklist (settings.manage). */
  setup: boolean;
};

export function commandCentreAccess(permissions: ReadonlySet<string>): CommandCentreAccess {
  const has = (p: PlatformPermission) => permissions.has(p);
  return {
    cvs: has("candidates.view"),
    candidateCare: has("candidates.manage"),
    posters: has("content.view"),
    posterApplicants: has("content.view") && has("candidates.view"),
    requirements: has("requirements.view"),
    bookings: has("recruitment.assessments"),
    approvals: has("approvals.view"),
    jobs: has("jobs.view"),
    support: has("support.view"),
    grievances: has("support.grievances"),
    leads: has("leads.view"),
    money: has("commercial.view"),
    orgs: has("orgs.view"),
    mobilisation: has("recruitment.mobilisation"),
    setup: has("settings.manage"),
  };
}

// ---------------------------------------------------------------------------
// Dates (India time, fixed +05:30, no daylight saving)
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** India-time calendar date ("2026-11-26") `daysAgo` days before `now`. */
export function istDate(now: Date, daysAgo = 0): string {
  return new Date(now.getTime() + IST_OFFSET_MS - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

/** The instant India-time midnight starts the day `daysAgo` days before `now`. */
export function istDayStart(now: Date, daysAgo = 0): Date {
  return new Date(Date.parse(`${istDate(now, daysAgo)}T00:00:00Z`) - IST_OFFSET_MS);
}

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-11-16" → "16 Nov". */
export function dayLabel(isoDay: string): string {
  return DAY_LABEL.format(new Date(`${isoDay}T00:00:00Z`));
}

/**
 * One point per India-time day for the last `days` days (oldest first, today last); days without rows are 0.
 * Rows outside the window are ignored.
 */
export function fillDailySeries(rows: readonly { day: string; count: number }[], now: Date, days: number): { day: string; label: string; value: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  return Array.from({ length: days }, (_, i) => {
    const day = istDate(now, days - 1 - i);
    return { day, label: dayLabel(day), value: byDay.get(day) ?? 0 };
  });
}

/** Grid columns from large screens for `count` tiles, so rows stay even (no lone tile on the last row). */
export function tileColumns(count: number): 2 | 3 | 4 | 5 {
  // Up to four tiles keep their normal size (a lone tile never stretches across the page).
  if (count <= 4) return 4;
  const options: (3 | 4 | 5)[] = count >= 9 ? [5, 4] : [5, 4, 3];
  const gaps = (c: number) => (c - (count % c)) % c;
  // Fewest empty places on the last row; on a tie the wider grid (shorter page).
  return options.reduce((best, c) => (gaps(c) < gaps(best) ? c : best));
}

// ---------------------------------------------------------------------------
// Small display helpers
// ---------------------------------------------------------------------------

/** "Super Admin", "Operations Manager"… from the role keys (default role names; other keys humanised). */
export function roleLabel(roleKeys: readonly string[], names: ReadonlyMap<string, string>): string | null {
  const labels = roleKeys.map((key) => names.get(key) ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
  return labels.length ? labels.join(", ") : null;
}

/**
 * Money per currency on one line ("₹1,20,000 · AED 500"), never added across currencies. More than `max` currencies:
 * the rest are counted ("+1 more currency"). Null when there is nothing.
 */
export function moneyLine(
  rows: readonly { currency: string; amountMinor: number }[],
  format: (amountMinor: number, currency: string) => string,
  max = 2,
): string | null {
  const shown = rows.filter((r) => r.amountMinor !== 0);
  if (shown.length === 0) return null;
  const head = shown.slice(0, max).map((r) => format(r.amountMinor, r.currency));
  const rest = shown.length - max;
  return rest > 0 ? `${head.join(" · ")} · +${rest} more ${rest === 1 ? "currency" : "currencies"}` : head.join(" · ");
}

/** "09:30" → "9:30 am", "14:05" → "2:05 pm" (venue time as typed). */
export function timeLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}

export type SeatState = {
  label: string;
  tone: "success" | "warning" | "neutral";
};

/** Seats left on an upcoming date: "4 seats left", "Full", or "Booking closed" (staff closed it). */
export function seatState(slot: { capacity: number; bookedSeats: number; status: string }): SeatState {
  if (slot.status !== "open") return { label: "Booking closed", tone: "neutral" };
  const left = Math.max(0, slot.capacity - slot.bookedSeats);
  if (left === 0) return { label: "Full", tone: "warning" };
  return {
    label: `${left} ${left === 1 ? "seat" : "seats"} left`,
    tone: "success",
  };
}

/** "1 CV" / "3 CVs". */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Sums a daily series (oldest first) into buckets of `size` days that end on the last day, so the newest bucket is
 * always a full week. A shorter first bucket keeps the oldest leftover days. Label: the bucket's first day ("from").
 */
export function bucketSeries(daily: readonly { day: string; value: number }[], size: number): { day: string; label: string; value: number }[] {
  if (size <= 1)
    return daily.map((d) => ({
      day: d.day,
      label: dayLabel(d.day),
      value: d.value,
    }));
  const out: { day: string; label: string; value: number }[] = [];
  for (let end = daily.length; end > 0; end -= size) {
    const chunk = daily.slice(Math.max(0, end - size), end);
    out.unshift({
      day: chunk[0]!.day,
      label: dayLabel(chunk[0]!.day),
      value: chunk.reduce((a, d) => a + d.value, 0),
    });
  }
  return out;
}
