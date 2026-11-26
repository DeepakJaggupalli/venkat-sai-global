import "server-only";

import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { isoDateIn } from "@/components/dashboard/greeting";
import { db } from "@/db";
import { partnerAssignments, partnerSettlements, partnerSubmissions } from "@/db/schema";
import { logger } from "@/lib/logger";
import { listPartnerSettlements } from "@/modules/commercial/queries";
import type { SettlementListItem } from "@/modules/commercial/types";
import type { OrgContext } from "@/modules/identity/authz";
import { unreadThreadCount } from "@/modules/operations/queries";
import { listPartnerAgreements, listPartnerLicences, type PartnerAgreementRow, type PartnerLicenceView } from "@/modules/organizations/partner";
import { getOrganizationOverview, type OrganizationOverview } from "@/modules/organizations/queries";
import type { InterviewView } from "@/modules/recruitment/interviews";
import type { PartnerAssignmentListItem, PartnerPerformance, PartnerSubmissionListItem } from "@/modules/recruitment/partner-queries";
import { getPartnerPerformance, listAssignmentsForPartner, listInterviewsForPartner, listSubmissionsForPartner } from "@/modules/recruitment/queries";

import { weeklyWindowStart, type SettlementTotalRow } from "./dashboard-model";
import { listPartnerMobilisations, type PartnerMobilisationItem } from "./queries";

/**
 * Partner Portal dashboard read model. Every figure is a live count of the caller's own partner
 * organisation, loaded only when the member's role has the matching permission (null otherwise),
 * and every section fails on its own: a broken query hides one card, never the dashboard.
 */

type PartnerCtx = OrgContext<"recruitment_partner">;

const PAGE = (pageSize: number) => ({ page: 1, pageSize, offset: 0 });
const DAY_MS = 86_400_000;
export const CHART_WEEKS = 8;

async function safe<T>(section: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    logger.warn("Partner dashboard section failed", { error, section });
    return null;
  }
}

function addDays(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Counts (exported for the integration test)
// ---------------------------------------------------------------------------

export type AssignmentCounts = { open: number; paused: number; dueThisWeek: number; overdue: number };

/** Assignment counts of the organisation; "due this week" = open with a due date in the next 7 days (today included). */
export async function countPartnerAssignments(organizationId: string, todayIso: string): Promise<AssignmentCounts> {
  const weekEnd = addDays(todayIso, 7);
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${partnerAssignments.status} = 'active')::int`,
      paused: sql<number>`count(*) filter (where ${partnerAssignments.status} = 'paused')::int`,
      dueThisWeek: sql<number>`count(*) filter (where ${partnerAssignments.status} = 'active' and ${partnerAssignments.dueDate} >= ${todayIso}::date and ${partnerAssignments.dueDate} <= ${weekEnd}::date)::int`,
      overdue: sql<number>`count(*) filter (where ${partnerAssignments.status} = 'active' and ${partnerAssignments.dueDate} < ${todayIso}::date)::int`,
    })
    .from(partnerAssignments)
    .where(eq(partnerAssignments.partnerOrganizationId, organizationId));
  return { open: Number(row?.open ?? 0), paused: Number(row?.paused ?? 0), dueThisWeek: Number(row?.dueThisWeek ?? 0), overdue: Number(row?.overdue ?? 0) };
}

/** Submissions of the organisation per status (all time). */
export async function countPartnerSubmissionsByStatus(organizationId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: partnerSubmissions.status, value: sql<number>`count(*)::int` })
    .from(partnerSubmissions)
    .where(eq(partnerSubmissions.partnerOrganizationId, organizationId))
    .groupBy(partnerSubmissions.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
}

/** Submissions (withdrawn excluded) per week, keyed by the Monday of the week in `timeZone`. */
export async function weeklyPartnerSubmissions(organizationId: string, todayIso: string, timeZone: string, weeks = CHART_WEEKS): Promise<{ weekStart: string; count: number }[]> {
  // A day of margin either side of the window start; weeklySeries() drops anything outside the window.
  const since = new Date(new Date(`${weeklyWindowStart(todayIso, weeks)}T00:00:00Z`).getTime() - DAY_MS);
  const week = sql<string>`to_char(date_trunc('week', ${partnerSubmissions.createdAt} at time zone ${timeZone}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ weekStart: week, count: sql<number>`count(*)::int` })
    .from(partnerSubmissions)
    .where(and(eq(partnerSubmissions.partnerOrganizationId, organizationId), ne(partnerSubmissions.status, "withdrawn"), gte(partnerSubmissions.createdAt, since)))
    // By position: the time zone is a bound parameter, so the expression would not match itself in GROUP BY.
    .groupBy(sql`1`);
  return rows.map((r) => ({ weekStart: String(r.weekStart), count: Number(r.count) }));
}

/** Settlement count and net payable per status and currency (statuses the partner may see). */
export async function partnerSettlementTotals(organizationId: string): Promise<SettlementTotalRow[]> {
  const rows = await db
    .select({
      status: partnerSettlements.status,
      currency: partnerSettlements.currency,
      count: sql<number>`count(*)::int`,
      netMinor: sql<string>`coalesce(sum(${partnerSettlements.amountMinor} - ${partnerSettlements.withholdingTaxMinor}), 0)::text`,
    })
    .from(partnerSettlements)
    .where(and(eq(partnerSettlements.partnerOrganizationId, organizationId), inArray(partnerSettlements.status, ["pending_approval", "approved", "paid", "disputed"])))
    .groupBy(partnerSettlements.status, partnerSettlements.currency);
  return rows.map((r) => ({ status: r.status, currency: String(r.currency).trim(), count: Number(r.count), netMinor: Number(r.netMinor) }));
}

// ---------------------------------------------------------------------------
// Dashboard loader
// ---------------------------------------------------------------------------

export type PartnerDashboardData = {
  todayIso: string;
  assignments: { counts: AssignmentCounts; recent: PartnerAssignmentListItem[] } | null;
  submissions: { byStatus: Record<string, number>; recent: PartnerSubmissionListItem[]; weekly: { weekStart: string; count: number }[] | null } | null;
  interviews: { upcoming: number; next: InterviewView[] } | null;
  documents: { candidates: number; openItems: number; rejectedItems: number; items: PartnerMobilisationItem[] } | null;
  settlements: { totals: SettlementTotalRow[]; recent: SettlementListItem[] } | null;
  performance: PartnerPerformance | null;
  overview: OrganizationOverview | null;
  agreements: PartnerAgreementRow[] | null;
  licences: PartnerLicenceView[] | null;
  unreadMessages: number | null;
};

export async function loadPartnerDashboard(ctx: PartnerCtx, timeZone: string, now: Date = new Date()): Promise<PartnerDashboardData> {
  const can = (p: string) => ctx.permissions.has(p);
  const orgId = ctx.organization.id;
  const todayIso = isoDateIn(now, timeZone);
  // "Upcoming" matches the Interviews page: it includes interviews that started in the last 12 hours.
  const interviewsFrom = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const [assignments, submissions, interviews, documents, settlements, performance, overview, agreements, licences, unreadMessages] = await Promise.all([
    can("partner.requirements.view")
      ? safe("assignments", async () => {
          const [counts, recent] = await Promise.all([countPartnerAssignments(orgId, todayIso), listAssignmentsForPartner(ctx, { status: "active" }, PAGE(5))]);
          return { counts, recent: recent.items };
        })
      : null,
    can("partner.submissions.view")
      ? safe("submissions", async () => {
          // The chart query fails on its own (null hides the chart instead of showing a false "nothing").
          const [byStatus, recent, weekly] = await Promise.all([
            countPartnerSubmissionsByStatus(orgId),
            listSubmissionsForPartner(ctx, {}, PAGE(5)),
            safe("submissions-weekly", () => weeklyPartnerSubmissions(orgId, todayIso, timeZone)),
          ]);
          return { byStatus, recent: recent.items, weekly };
        })
      : null,
    can("partner.submissions.view")
      ? safe("interviews", async () => {
          // Cancelled and finished interviews are not "upcoming".
          const [scheduled, rescheduled] = await Promise.all([
            listInterviewsForPartner(ctx, { from: interviewsFrom, status: "scheduled" }, PAGE(5)),
            listInterviewsForPartner(ctx, { from: interviewsFrom, status: "rescheduled" }, PAGE(5)),
          ]);
          const next = [...scheduled.items, ...rescheduled.items].sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()).slice(0, 5);
          return { upcoming: scheduled.total + rescheduled.total, next };
        })
      : null,
    can("partner.documents.manage")
      ? safe("documents", async () => {
          const items = (await listPartnerMobilisations(ctx, { openOnly: true })).filter((m) => m.openItems > 0);
          return {
            candidates: items.length,
            openItems: items.reduce((n, m) => n + m.openItems, 0),
            rejectedItems: items.reduce((n, m) => n + m.rejectedItems, 0),
            items,
          };
        })
      : null,
    can("partner.settlements.view")
      ? safe("settlements", async () => {
          const [totals, recent] = await Promise.all([partnerSettlementTotals(orgId), listPartnerSettlements(ctx, PAGE(4))]);
          return { totals, recent: recent.items };
        })
      : null,
    can("partner.performance.view") ? safe("performance", () => getPartnerPerformance({ kind: "partner", ctx })) : null,
    can("partner.profile.manage") || can("partner.team.manage") ? safe("overview", () => getOrganizationOverview(ctx, orgId, now)) : null,
    can("partner.profile.manage") ? safe("agreements", () => listPartnerAgreements(ctx, orgId)) : null,
    can("partner.profile.manage") ? safe("licences", () => listPartnerLicences(ctx, orgId)) : null,
    can("partner.messages") ? safe("messages", () => unreadThreadCount({ kind: "org", ctx })) : null,
  ]);

  return { todayIso, assignments, submissions, interviews, documents, settlements, performance, overview, agreements, licences, unreadMessages };
}
