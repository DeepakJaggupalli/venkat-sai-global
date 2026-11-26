/**
 * Partner Portal dashboard model (pure, client-safe): which buttons a member's role may use, the
 * agency set-up checklist, the weekly submissions series and the settlement money summary. The page
 * feeds it real counts from the database (src/app/recruiter/(workspace)/_lib/dashboard.ts).
 */
import {
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  Inbox,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { ChartDatum, ChecklistItem, QuickActionItem } from "@/components/dashboard/types";
import { formatMoney } from "@/lib/format";

type Permissions = ReadonlySet<string> | readonly string[];

function has(permissions: Permissions, key: string): boolean {
  return Array.isArray(permissions) ? permissions.includes(key) : (permissions as ReadonlySet<string>).has(key);
}

// ---------------------------------------------------------------------------
// "Submit a candidate" target
// ---------------------------------------------------------------------------

export type SubmitTargetAssignment = { id: string; status: string; submissionLimit: number | null; submissionsUsed: number };

/** True while an assignment is open and has submission room left. */
export function canTakeSubmissions(a: SubmitTargetAssignment): boolean {
  return a.status === "active" && (a.submissionLimit === null || a.submissionsUsed < a.submissionLimit);
}

/**
 * Submitting always happens against a requirement. With exactly one open requirement that still has
 * room, the button goes straight to its submit form; otherwise to the list to pick one.
 */
export function submitCandidateHref(openAssignments: readonly SubmitTargetAssignment[] | null | undefined, openTotal: number | null | undefined): string {
  const open = (openAssignments ?? []).filter(canTakeSubmissions);
  if (openTotal === 1 && open.length === 1) return `/recruiter/requirements/${open[0]!.id}/submit`;
  return "/recruiter/requirements";
}

// ---------------------------------------------------------------------------
// Quick actions (filtered by the member's role)
// ---------------------------------------------------------------------------

export type PartnerActionCounts = {
  openRequirements?: number | null;
  pendingReview?: number | null;
  upcomingInterviews?: number | null;
  documentsNeeded?: number | null;
  settlementsAwaiting?: number | null;
  unreadMessages?: number | null;
  pendingInvites?: number | null;
};

type ActionDef = QuickActionItem & { permission: string | null; group: "work" | "agency" };

/** Every main button of the Partner Portal, in menu order. */
export function partnerActionDefs(counts: PartnerActionCounts = {}, submitHref = "/recruiter/requirements"): ActionDef[] {
  const defs: (Omit<ActionDef, "icon"> & { icon: LucideIcon })[] = [
    {
      group: "work",
      label: "Submit a candidate",
      href: submitHref,
      icon: UserPlus,
      hint: submitHref === "/recruiter/requirements" ? "Pick a requirement, then add the person" : "Add a person to your open requirement",
      permission: "partner.candidates.submit",
    },
    { group: "work", label: "My candidates", href: "/recruiter/candidates", icon: Users, hint: "People you sourced or submitted", permission: "partner.candidates.submit" },
    {
      group: "work",
      label: "Requirements",
      href: "/recruiter/requirements",
      icon: ClipboardList,
      hint: "Jobs Venkat Sai gave your agency",
      badge: counts.openRequirements,
      badgeLabel: "open",
      permission: "partner.requirements.view",
    },
    {
      group: "work",
      label: "Submissions",
      href: "/recruiter/submissions",
      icon: Inbox,
      hint: "Our review and hiring progress",
      badge: counts.pendingReview,
      badgeLabel: "in review",
      permission: "partner.submissions.view",
    },
    {
      group: "work",
      label: "Interviews",
      href: "/recruiter/interviews",
      icon: CalendarClock,
      hint: "Help candidates prepare and attend",
      badge: counts.upcomingInterviews,
      badgeLabel: "upcoming",
      permission: "partner.submissions.view",
    },
    {
      group: "work",
      label: "Documents",
      href: "/recruiter/documents",
      icon: FileText,
      hint: "Papers we need for travel",
      badge: counts.documentsNeeded,
      badgeLabel: "needed",
      permission: "partner.documents.manage",
    },
    {
      group: "work",
      label: "Messages",
      href: "/recruiter/messages",
      icon: MessageSquare,
      hint: "Talk to your Venkat Sai contact",
      badge: counts.unreadMessages,
      badgeLabel: "unread",
      permission: "partner.messages",
    },
    { group: "work", label: "Support", href: "/recruiter/support", icon: LifeBuoy, hint: "Ask for help or report a problem", permission: null },
    {
      group: "agency",
      label: "Settlements",
      href: "/recruiter/settlements",
      icon: Wallet,
      hint: "Commission for your placements",
      badge: counts.settlementsAwaiting,
      badgeLabel: "awaiting payment",
      permission: "partner.settlements.view",
    },
    { group: "agency", label: "Performance", href: "/recruiter/performance", icon: BarChart3, hint: "Acceptance, interviews and joining", permission: "partner.performance.view" },
    {
      group: "agency",
      label: "Team",
      href: "/recruiter/team",
      icon: UsersRound,
      hint: "Invite recruiters and set roles",
      badge: counts.pendingInvites,
      badgeLabel: "invited",
      permission: "partner.team.manage",
    },
    { group: "agency", label: "Agency profile", href: "/recruiter/profile", icon: Building2, hint: "Licences, agreement and verification", permission: "partner.profile.manage" },
    { group: "agency", label: "Billing", href: "/recruiter/billing", icon: CreditCard, hint: "Plan, invoices and payments", permission: "partner.billing.manage" },
    { group: "agency", label: "Announcements", href: "/recruiter/announcements", icon: Megaphone, hint: "News from Venkat Sai", permission: "partner.profile.manage" },
  ];
  return defs;
}

/** The buttons this member may use, split into daily work and agency / money. */
export function partnerQuickActions(permissions: Permissions, counts: PartnerActionCounts = {}, submitHref?: string): { work: QuickActionItem[]; agency: QuickActionItem[] } {
  const allowed = partnerActionDefs(counts, submitHref).filter((d) => d.permission === null || has(permissions, d.permission));
  const strip = (d: ActionDef): QuickActionItem => {
    const item: QuickActionItem & { permission?: unknown; group?: unknown } = { ...d };
    delete item.permission;
    delete item.group;
    return item;
  };
  return {
    work: allowed.filter((d) => d.group === "work").map(strip),
    agency: allowed.filter((d) => d.group === "agency").map(strip),
  };
}

// ---------------------------------------------------------------------------
// Agency set-up checklist
// ---------------------------------------------------------------------------

export type PartnerSetupInput = {
  orgStatus: string;
  /** Codes of what is still missing before verification (organizations readiness). */
  readinessIssueCodes: readonly string[];
  agreementStatuses: readonly string[];
  memberCount: number;
  pendingInvites: number;
  submissionsMade: number;
  canManageTeam: boolean;
  canSubmit: boolean;
};

const PROFILE_ISSUES = new Set(["name", "country", "city", "contact", "business_type"]);

/** Set-up steps for owners and admins (partner.profile.manage), each marked done from real records. */
export function partnerSetupChecklist(input: PartnerSetupInput): ChecklistItem[] {
  const codes = input.readinessIssueCodes;
  const submittedForVerification = ["pending", "under_review", "verified"].includes(input.orgStatus);
  const items: ChecklistItem[] = [
    {
      id: "profile",
      label: "Fill in your agency details",
      description: "Registered city, contact and business type.",
      done: submittedForVerification || !codes.some((c) => PROFILE_ISSUES.has(c)),
      href: "/recruiter/profile",
    },
    {
      id: "licence",
      label: "Add your recruitment licence",
      description: "We check it before assigning overseas requirements.",
      done: submittedForVerification || !codes.includes("licence"),
      href: "/recruiter/profile#licences",
    },
    {
      id: "documents",
      label: "Upload registration documents",
      description: "A current copy of each required document.",
      done: submittedForVerification || !codes.some((c) => c.startsWith("document_")),
      href: "/recruiter/profile/verification",
    },
    {
      id: "verification",
      label: "Send your agency for verification",
      description: "Venkat Sai reviews it and lets you know.",
      done: submittedForVerification,
      href: "/recruiter/profile/verification",
    },
    {
      id: "agreement",
      label: "Accept the partner agreement",
      description: input.agreementStatuses.includes("pending")
        ? "Venkat Sai has sent it. Read it and accept it."
        : input.orgStatus === "verified"
          ? "Venkat Sai will send it to you. Nothing to do until then."
          : "Venkat Sai sends it once you are verified.",
      done: input.agreementStatuses.includes("active"),
      href: "/recruiter/profile#agreement",
    },
  ];
  if (input.canManageTeam) {
    items.push({
      id: "team",
      label: "Invite your recruiters",
      description: "Optional. Each person gets their own sign-in.",
      done: input.memberCount > 1 || input.pendingInvites > 0,
      href: "/recruiter/team",
    });
  }
  if (input.canSubmit) {
    items.push({
      id: "first-submission",
      label: "Submit your first candidate",
      description: "From an assigned requirement, with the person's consent.",
      done: input.submissionsMade > 0,
      href: "/recruiter/requirements",
    });
  }
  return items;
}

/** Steps that never keep the checklist on screen by themselves. */
export const OPTIONAL_SETUP_STEPS: ReadonlySet<string> = new Set(["team"]);

/** Show the checklist while a required step is still open (an optional one alone does not keep it). */
export function needsSetup(items: readonly ChecklistItem[]): boolean {
  return items.some((i) => !i.done && !OPTIONAL_SETUP_STEPS.has(i.id));
}

// ---------------------------------------------------------------------------
// Weekly submissions series
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday (ISO week start) of the given calendar date, as YYYY-MM-DD. */
export function weekStartOf(isoDate: string): string {
  const d = utcDate(isoDate);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return isoOf(new Date(d.getTime() - offset * DAY_MS));
}

/** First day of the oldest week in a `weeks`-long window ending with the week of `todayIso`. */
export function weeklyWindowStart(todayIso: string, weeks: number): string {
  return isoOf(new Date(utcDate(weekStartOf(todayIso)).getTime() - (Math.max(1, weeks) - 1) * 7 * DAY_MS));
}

const WEEK_LABEL = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Fills a `weeks`-long series (oldest first, ending with the current week) from per-week counts keyed
 * by the Monday of each week. Weeks with nothing are zero; rows outside the window are ignored.
 */
export function weeklySeries(rows: readonly { weekStart: string; count: number }[], todayIso: string, weeks = 8): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = weekStartOf(r.weekStart);
    counts.set(key, (counts.get(key) ?? 0) + Number(r.count || 0));
  }
  const start = utcDate(weeklyWindowStart(todayIso, weeks)).getTime();
  return Array.from({ length: Math.max(1, weeks) }, (_, i) => {
    const day = new Date(start + i * 7 * DAY_MS);
    return { label: WEEK_LABEL.format(day), value: counts.get(isoOf(day)) ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Submission stages and the hiring funnel
// ---------------------------------------------------------------------------

export type SubmissionStageKey = "submitted" | "under_review" | "duplicate" | "accepted" | "rejected" | "withdrawn";

export const SUBMISSION_STAGE_ORDER: readonly SubmissionStageKey[] = ["submitted", "under_review", "duplicate", "accepted", "rejected", "withdrawn"];

/** Stages in display order with their counts (zero for stages without rows). */
export function submissionStages(byStatus: Partial<Record<string, number>>): { status: SubmissionStageKey; count: number }[] {
  return SUBMISSION_STAGE_ORDER.map((status) => ({ status, count: Number(byStatus[status] ?? 0) }));
}

export type FunnelInput = { profilesSubmitted: number; accepted: number; shortlisted: number; interviewed: number; placed: number; joined: number };

/** From submission to joining, as chart points (real counts from partner performance). */
export function hiringFunnel(p: FunnelInput): ChartDatum[] {
  return [
    { label: "Submitted", value: p.profilesSubmitted },
    { label: "Accepted", value: p.accepted },
    { label: "Shortlisted", value: p.shortlisted },
    { label: "Interviewed", value: p.interviewed },
    { label: "Placed", value: p.placed },
    { label: "Joined", value: p.joined },
  ];
}

// ---------------------------------------------------------------------------
// Settlements money summary (never assumes a currency)
// ---------------------------------------------------------------------------

export type SettlementTotalRow = { status: string; currency: string; count: number; netMinor: number };

export type SettlementSummary = {
  awaitingCount: number;
  /** Net amounts being approved or approved and not yet paid, one formatted string per currency. */
  awaitingAmounts: string[];
  paidCount: number;
  paidAmounts: string[];
  disputedCount: number;
};

function amountsByCurrency(rows: readonly SettlementTotalRow[], locale?: string): string[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.currency) continue;
    totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.netMinor || 0));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, minor]) => formatMoney(minor, currency, locale));
}

export function summarizeSettlements(rows: readonly SettlementTotalRow[], locale?: string): SettlementSummary {
  const awaiting = rows.filter((r) => r.status === "pending_approval" || r.status === "approved");
  const paid = rows.filter((r) => r.status === "paid");
  const sum = (list: readonly SettlementTotalRow[]) => list.reduce((n, r) => n + Number(r.count || 0), 0);
  return {
    awaitingCount: sum(awaiting),
    awaitingAmounts: amountsByCurrency(awaiting, locale),
    paidCount: sum(paid),
    paidAmounts: amountsByCurrency(paid, locale),
    disputedCount: sum(rows.filter((r) => r.status === "disputed")),
  };
}

// ---------------------------------------------------------------------------
// Licence alerts
// ---------------------------------------------------------------------------

export type LicenceLike = { id: string; licenceNumber: string; verificationStatus: string; validUntil: string | null };

/** Whole days from today (UTC calendar) to a YYYY-MM-DD date. */
export function daysFromToday(isoDate: string | null, now: Date = new Date()): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((utcDate(isoDate).getTime() - today) / DAY_MS);
}

/** Verified licences that expire within `withinDays` (or have already expired), soonest first. */
export function expiringLicences<T extends LicenceLike>(licences: readonly T[], now: Date = new Date(), withinDays = 60): (T & { daysLeft: number })[] {
  return licences
    .map((l) => ({ ...l, daysLeft: daysFromToday(l.validUntil, now) }))
    .filter((l): l is T & { daysLeft: number } => l.verificationStatus === "verified" && l.daysLeft !== null && l.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------------------------------------------------------------------------
// Two-column layout of the dashboard lists
// ---------------------------------------------------------------------------

/** Rows an empty list takes up (its empty state is about as tall as four list rows). */
export const EMPTY_ROWS = 4;

/**
 * Splits cards into two columns of similar height: each card, in priority order, goes to the shorter
 * column (ties to the left), so a short list never sits as a tall half-empty card next to a long one.
 */
export function balanceColumns<T extends { rows: number }>(cards: readonly T[], headerRows = 2): [T[], T[]] {
  const columns: [T[], T[]] = [[], []];
  const heights: [number, number] = [0, 0];
  for (const card of cards) {
    const target = heights[0] <= heights[1] ? 0 : 1;
    columns[target].push(card);
    heights[target] += Math.max(0, card.rows) + headerRows;
  }
  return columns;
}
