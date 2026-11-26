import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { CV_SUBMISSION_STATUSES, type CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./internal";

/**
 * Owner overview (/admin/overview): one screen of business figures for a period (7 / 30 / 90 days). Every figure is
 * a live aggregate (seven parallel queries, no per-row lookups). Money is grouped per currency and never summed across
 * currencies; revenue and invoices are only loaded for staff with commercial.view.
 *
 * Period figures count events inside the window (CVs received, posters published, requirements filled, applications,
 * placements, departures, joinings, enrolments, resume requests, money received). "Open" figures are the current
 * state (posters live now, requirements in progress now, invoices outstanding now).
 */

export const OVERVIEW_PERIODS = [7, 30, 90] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export function parseOverviewPeriod(value: unknown): OverviewPeriod {
  const n = Number(value);
  return (OVERVIEW_PERIODS as readonly number[]).includes(n) ? (n as OverviewPeriod) : 30;
}

export type CurrencyTotal = { currency: string; amountMinor: number; count: number };

export type OwnerOverview = {
  days: OverviewPeriod;
  since: Date;
  cvs: {
    total: number;
    byTrade: { trade: string; count: number }[];
    otherTrades: number;
    byStatus: { status: CvSubmissionStatus; count: number }[];
    /** CVs per India-time day inside the period (days without CVs are absent; the page fills the gaps). */
    perDay: { day: string; count: number }[];
  };
  posters: { published: number; open: number; topCountries: { countryCode: string; countryName: string; count: number }[] };
  requirements: { received: number; open: number; filled: number; positionsFilled: number };
  recruitment: { applications: number; placements: number; departed: number; arrived: number; joined: number };
  training: { enrolments: number };
  resumeRequests: number;
  /** null when the viewer may not see commercial figures. */
  money: { received: CurrencyTotal[]; outstanding: CurrencyTotal[] } | null;
};

/** Requirement statuses that still need delivery (same set as the executive dashboard). */
const OPEN_REQUIREMENT = sql`('submitted', 'under_review', 'approved', 'sourcing', 'in_progress', 'partially_filled', 'on_hold')`;

const n = (v: unknown): number => (v == null ? 0 : Number(v));

export async function getOwnerOverview(ctx: StaffContext, days: OverviewPeriod, now: Date = new Date()): Promise<OwnerOverview> {
  assertStaff(ctx, "dashboard.view");
  const since = new Date(now.getTime() - days * 86_400_000);
  const sinceDate = since.toISOString().slice(0, 10);
  const canMoney = staffCan(ctx, "commercial.view");

  const [scalars, trades, statuses, countries, received, outstanding, perDay] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select
        (select count(*) from cv_submissions where created_at >= ${since}) as cvs,
        (select count(*) from cms_entries where collection = 'requirement_posts' and deleted_at is null and published_at >= ${since}) as posters_published,
        (select count(*) from cms_entries where collection = 'requirement_posts' and deleted_at is null and status = 'published'
          and (unpublish_at is null or unpublish_at > now())
          and (coalesce(data->>'applyBy', '') = '' or data->>'applyBy' >= to_char(current_date, 'YYYY-MM-DD'))) as posters_open,
        (select count(*) from requirement_requests where status <> 'draft' and coalesce(submitted_at, created_at) >= ${since}) as req_received,
        (select count(*) from requirement_requests where status in ${OPEN_REQUIREMENT}) as req_open,
        (select count(*) from requirement_requests where status = 'filled' and coalesce(closed_at, updated_at) >= ${since}) as req_filled,
        (select coalesce(sum(l.filled_count), 0) from requirement_lines l join requirement_requests r on r.id = l.requirement_id
          where r.status = 'filled' and coalesce(r.closed_at, r.updated_at) >= ${since}) as positions_filled,
        (select count(*) from applications where created_at >= ${since}) as applications,
        (select count(*) from placements where status <> 'cancelled' and placed_on >= ${sinceDate}::date) as placements,
        (select count(*) from mobilisation_records where departed_at >= ${since}) as departed,
        (select count(*) from mobilisation_records where arrived_at >= ${since}) as arrived,
        (select count(*) from placements where joined_on >= ${sinceDate}::date) as joined,
        (select count(*) from enrolments where applied_at >= ${since}) as enrolments,
        (select count(*) from resume_requests where created_at >= ${since}) as resume_requests
    `),
    db.execute<{ trade: string; count: unknown }>(sql`
      select min(btrim(trade_label)) as trade, count(*) as count
      from cv_submissions where created_at >= ${since}
      group by lower(btrim(trade_label)) order by count desc, trade limit 10`),
    db.execute<{ status: CvSubmissionStatus; count: unknown }>(sql`select status, count(*) as count from cv_submissions where created_at >= ${since} group by status`),
    db.execute<{ code: string; name: string | null; count: unknown }>(sql`
      select e.data->>'countryCode' as code, min(c.name) as name, count(*) as count
      from cms_entries e left join countries c on c.code = e.data->>'countryCode'
      where e.collection = 'requirement_posts' and e.deleted_at is null and e.published_at >= ${since} and coalesce(e.data->>'countryCode', '') <> ''
      group by e.data->>'countryCode' order by count desc, code limit 10`),
    canMoney
      ? db.execute<{ currency: string; amount: unknown; cnt: unknown }>(sql`
          select currency, coalesce(sum(amount_minor - amount_refunded_minor), 0) as amount, count(*) as cnt
          from payments
          where status in ('succeeded', 'partially_refunded') and received_at >= ${since}
          group by currency order by currency`)
      : null,
    canMoney
      ? db.execute<{ currency: string; amount: unknown; cnt: unknown }>(sql`
          select currency, coalesce(sum(total_minor - amount_paid_minor), 0) as amount, count(*) as cnt
          from invoices
          where document_type = 'invoice' and status in ('issued', 'partially_paid', 'overdue') and total_minor > amount_paid_minor
          group by currency order by currency`)
      : null,
    db.execute<{ day: string; count: unknown }>(sql`
      select to_char((created_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, count(*) as count
      from cv_submissions where created_at >= ${since} group by 1 order by 1`),
  ]);

  const s = scalars.rows[0] ?? {};
  const cvTotal = n(s.cvs);
  const byTrade = trades.rows.map((r) => ({ trade: r.trade, count: n(r.count) }));
  const statusCounts = new Map(statuses.rows.map((r) => [r.status, n(r.count)]));
  const money = (rows: { currency: string; amount: unknown; cnt: unknown }[]): CurrencyTotal[] => rows.map((r) => ({ currency: String(r.currency), amountMinor: n(r.amount), count: n(r.cnt) }));

  return {
    days,
    since,
    cvs: {
      total: cvTotal,
      byTrade,
      otherTrades: Math.max(0, cvTotal - byTrade.reduce((a, r) => a + r.count, 0)),
      byStatus: CV_SUBMISSION_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
      perDay: perDay.rows.map((r) => ({ day: r.day, count: n(r.count) })),
    },
    posters: {
      published: n(s.posters_published),
      open: n(s.posters_open),
      topCountries: countries.rows.map((r) => ({ countryCode: r.code, countryName: r.name ?? r.code, count: n(r.count) })),
    },
    requirements: { received: n(s.req_received), open: n(s.req_open), filled: n(s.req_filled), positionsFilled: n(s.positions_filled) },
    recruitment: { applications: n(s.applications), placements: n(s.placements), departed: n(s.departed), arrived: n(s.arrived), joined: n(s.joined) },
    training: { enrolments: n(s.enrolments) },
    resumeRequests: n(s.resume_requests),
    money: received && outstanding ? { received: money(received.rows), outstanding: money(outstanding.rows) } : null,
  };
}
