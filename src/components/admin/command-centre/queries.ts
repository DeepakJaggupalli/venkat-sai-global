import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { venueNow } from "@/modules/bookings/rules";
import type { StaffContext } from "@/modules/identity/authz";
import { isoDatePlusMonths, PASSPORT_EXPIRY_WARNING_MONTHS } from "@/modules/operations/cv-submissions";
import { myTaskCounts } from "@/modules/operations/queries";
import { countDueReferralRewards } from "@/modules/referrals/queries";

import { commandCentreAccess, fillDailySeries, istDayStart, type CommandCentreAccess } from "./config";

/**
 * Live figures for the Command Centre home (/admin). Role-aware: a block is only queried when the viewer may open the
 * page behind it (see commandCentreAccess); blocks the viewer may not see come back as null. Every number is a real
 * count; money is grouped per currency and never added across currencies. Today and "last 7 days" use India time.
 *
 * One failing query never takes the dashboard down: its block is left out, `partial` is set so the page can say some
 * figures did not load, and the failure is logged (no personal data).
 */

export const CHART_DAYS = 14;
export const TRADE_WINDOW_DAYS = 30;
export const TOP_TRADES = 8;
const LIST_LIMIT = 5;

export type CurrencyAmount = {
  currency: string;
  amountMinor: number;
  count: number;
};

export type PosterSummary = {
  id: string;
  title: string;
  country: string | null;
  publishedAt: Date | null;
  applicants: number;
  applicantsWeek: number;
};
export type SlotSummary = {
  id: string;
  title: string;
  trade: string;
  kind: "trade_test" | "training";
  date: string;
  startTime: string;
  capacity: number;
  bookedSeats: number;
  status: string;
};
export type ActivityItem = {
  id: string;
  kind: "cv" | "booking" | "enquiry";
  title: string;
  meta: string;
  at: Date;
  href: string;
};

export type CommandCentreSnapshot = {
  access: CommandCentreAccess;
  generatedAt: Date;
  /** Some figures failed to load (their blocks are null); the page says so and offers a refresh. */
  partial: boolean;
  /** The viewer's own open tasks (null only when they failed to load). */
  tasks: { open: number; overdue: number } | null;
  cvs: {
    today: number;
    week: number;
    toCallBack: number;
    expiringPassports: number;
    perDay: { day: string; label: string; value: number }[];
    byTrade: { trade: string; categoryId: string | null; count: number }[];
    tradeWindowTotal: number;
  } | null;
  candidateCare: { reviewsPending: number; referralsDue: number } | null;
  posters: { open: number; items: PosterSummary[] } | null;
  requirements: {
    open: number;
    toReview: number;
    positionsOpen: number;
  } | null;
  bookings: {
    upcoming: number;
    bookedSeats: number;
    freeSeats: number;
    next: SlotSummary[];
  } | null;
  approvalsOpen: number | null;
  jobs: { active: number; pendingApproval: number } | null;
  support: { open: number; grievances: number | null } | null;
  leads: { open: number; newEnquiries: number } | null;
  money: {
    unpaid: CurrencyAmount[];
    unpaidCount: number;
    received30d: CurrencyAmount[];
  } | null;
  orgs: {
    companies: number;
    agencies: number;
    partners: number;
    institutions: number;
  } | null;
  placements30d: number | null;
  activity: ActivityItem[];
  setup: {
    posters: number;
    slots: number;
    cvs: number;
    otherStaff: number;
  } | null;
};

const n = (v: unknown): number => (v == null ? 0 : Number(v));
const OPEN_REQUIREMENT = sql`('submitted', 'under_review', 'approved', 'sourcing', 'in_progress', 'partially_filled', 'on_hold')`;
const OPEN_TICKET = sql`('open', 'pending_staff', 'pending_requester', 'on_hold')`;
/** Requirement posters live on the website now (same rule as the owner overview and the public list). */
const OPEN_POSTER = sql`e.collection = 'requirement_posts' and e.deleted_at is null and e.status = 'published'
  and (e.unpublish_at is null or e.unpublish_at > now())
  and (coalesce(e.data->>'applyBy', '') = '' or e.data->>'applyBy' >= to_char(current_date, 'YYYY-MM-DD'))`;

async function rowsOf<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return (await db.execute<T>(query)).rows as T[];
}

const skip = <T>(): Promise<T | null> => Promise.resolve(null);

export async function getCommandCentreSnapshot(ctx: StaffContext, now: Date = new Date()): Promise<CommandCentreSnapshot> {
  const access = commandCentreAccess(ctx.permissions);
  const today = istDayStart(now);
  const week = istDayStart(now, 6);
  const chartStart = istDayStart(now, CHART_DAYS - 1);
  const tradeSince = istDayStart(now, TRADE_WINDOW_DAYS - 1);
  const expiryLimit = isoDatePlusMonths(PASSPORT_EXPIRY_WARNING_MONTHS, now);
  const venue = venueNow(now);
  const upcomingSlot = sql`(s.date > ${venue.date}::date or (s.date = ${venue.date}::date and s.start_time > ${venue.time}))`;
  const enquiryVisible = access.grievances ? sql`true` : sql`q.type <> 'grievance'`;

  let failures = 0;
  const safe = async <T>(load: Promise<T>): Promise<T | null> => {
    try {
      return await load;
    } catch (error) {
      failures++;
      logger.warn("Command Centre figure failed to load", { error });
      return null;
    }
  };
  const rows = <T extends Record<string, unknown>>(query: SQL) => safe(rowsOf<T>(query));
  const first = async (query: SQL) => {
    const list = await rows<Record<string, unknown>>(query);
    return list ? (list[0] ?? {}) : null;
  };

  const [
    tasks,
    cvCounts,
    perDay,
    trades,
    care,
    posterCount,
    posterItems,
    requirements,
    slotCounts,
    nextSlots,
    approvals,
    jobs,
    support,
    leads,
    unpaid,
    received,
    orgs,
    placements,
    recentCvs,
    recentBookings,
    recentEnquiries,
    setup,
  ] = await Promise.all([
    safe(myTaskCounts(ctx)),
    access.cvs
      ? first(sql`
            select count(*) filter (where created_at >= ${today}) as today,
              count(*) filter (where created_at >= ${week}) as week,
              count(*) filter (where status = 'received') as to_call,
              count(*) filter (where passport_expiry is not null and passport_expiry <= ${expiryLimit}::date) as expiring
            from cv_submissions`)
      : skip<Record<string, unknown>>(),
    access.cvs
      ? rows<{ day: string; count: unknown }>(sql`
            select to_char((created_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, count(*) as count
            from cv_submissions where created_at >= ${chartStart} group by 1`)
      : skip<{ day: string; count: unknown }[]>(),
    access.cvs
      ? rows<{
          trade: string;
          category_id: string | null;
          count: unknown;
          total: unknown;
        }>(sql`
            select min(btrim(trade_label)) as trade, min(job_category_id::text) as category_id, count(*) as count,
              sum(count(*)) over () as total
            from cv_submissions where created_at >= ${tradeSince}
            group by lower(btrim(trade_label)) order by count desc, trade limit ${TOP_TRADES}`)
      : skip<
          {
            trade: string;
            category_id: string | null;
            count: unknown;
            total: unknown;
          }[]
        >(),
    access.candidateCare
      ? safe(
          Promise.all([
            rowsOf(sql`select count(*) as pending from worker_reviews where status = 'pending'`).then((r) => r[0] ?? {}),
            countDueReferralRewards(),
          ]),
        )
      : skip<[Record<string, unknown>, number]>(),
    access.posters ? first(sql`select count(*) as open from cms_entries e where ${OPEN_POSTER}`) : skip<Record<string, unknown>>(),
    access.posters
      ? rows<{
          id: string;
          title: string;
          country: string | null;
          published_at: Date | string | null;
          applicants: unknown;
          applicants_week: unknown;
        }>(sql`
            select e.id, e.title, coalesce(c.name, e.data->>'countryCode') as country, e.published_at,
              (select count(*) from cv_submissions s where s.requirement_entry_id = e.id) as applicants,
              (select count(*) from cv_submissions s where s.requirement_entry_id = e.id and s.created_at >= ${week}) as applicants_week
            from cms_entries e left join countries c on c.code = e.data->>'countryCode'
            where ${OPEN_POSTER}
            order by e.published_at desc nulls last, e.id limit ${LIST_LIMIT}`)
      : skip<
          {
            id: string;
            title: string;
            country: string | null;
            published_at: Date | string | null;
            applicants: unknown;
            applicants_week: unknown;
          }[]
        >(),
    access.requirements
      ? first(sql`
            select count(*) filter (where r.status in ${OPEN_REQUIREMENT}) as open,
              count(*) filter (where r.status = 'submitted') as to_review,
              (select coalesce(sum(greatest(l.positions - l.filled_count, 0)), 0) from requirement_lines l
                join requirement_requests rr on rr.id = l.requirement_id where rr.status in ${OPEN_REQUIREMENT}) as positions_open
            from requirement_requests r`)
      : skip<Record<string, unknown>>(),
    access.bookings
      ? first(sql`
            select count(*) as upcoming, coalesce(sum(s.booked_seats), 0) as booked,
              coalesce(sum(s.capacity - s.booked_seats) filter (where s.status = 'open'), 0) as free
            from booking_slots s where s.status in ('open', 'closed') and ${upcomingSlot}`)
      : skip<Record<string, unknown>>(),
    access.bookings
      ? rows<{
          id: string;
          title: string;
          trade: string;
          kind: SlotSummary["kind"];
          date: string;
          start_time: string;
          capacity: unknown;
          booked_seats: unknown;
          status: string;
        }>(sql`
            select s.id, s.title, s.trade, s.kind, to_char(s.date, 'YYYY-MM-DD') as date, s.start_time, s.capacity, s.booked_seats, s.status
            from booking_slots s where s.status in ('open', 'closed') and ${upcomingSlot}
            order by s.date, s.start_time, s.id limit ${LIST_LIMIT}`)
      : skip<
          {
            id: string;
            title: string;
            trade: string;
            kind: SlotSummary["kind"];
            date: string;
            start_time: string;
            capacity: unknown;
            booked_seats: unknown;
            status: string;
          }[]
        >(),
    access.approvals
      ? first(sql`select count(*) as open from approval_requests where status in ('pending', 'in_review', 'escalated')`)
      : skip<Record<string, unknown>>(),
    access.jobs
      ? first(sql`
            select count(*) filter (where status = 'published' and (published_at is null or published_at <= now())
                and (expires_at is null or expires_at > now()) and (application_deadline is null or application_deadline > now())) as active,
              count(*) filter (where status = 'pending_approval') as pending
            from jobs where deleted_at is null`)
      : skip<Record<string, unknown>>(),
    access.support
      ? first(sql`
            select count(*) as open, count(*) filter (where grievance_code is not null) as grievances
            from support_tickets where status in ${OPEN_TICKET}`)
      : skip<Record<string, unknown>>(),
    access.leads
      ? first(sql`
            select (select count(*) from leads where status in ('new', 'contacted', 'qualified', 'proposal', 'nurturing')) as open,
              (select count(*) from enquiries q where q.status = 'new' and ${enquiryVisible}) as new_enquiries`)
      : skip<Record<string, unknown>>(),
    access.money
      ? rows<{ currency: string; amount: unknown; cnt: unknown }>(sql`
            select currency, coalesce(sum(total_minor - amount_paid_minor), 0) as amount, count(*) as cnt
            from invoices
            where document_type = 'invoice' and status in ('issued', 'partially_paid', 'overdue') and total_minor > amount_paid_minor
            group by currency order by currency`)
      : skip<{ currency: string; amount: unknown; cnt: unknown }[]>(),
    access.money
      ? rows<{ currency: string; amount: unknown; cnt: unknown }>(sql`
            select currency, coalesce(sum(amount_minor - amount_refunded_minor), 0) as amount, count(*) as cnt
            from payments
            where status in ('succeeded', 'partially_refunded') and coalesce(received_at, created_at) >= ${new Date(now.getTime() - 30 * 86_400_000)}
            group by currency order by currency`)
      : skip<{ currency: string; amount: unknown; cnt: unknown }[]>(),
    access.orgs
      ? first(sql`
            select count(*) filter (where type = 'employer' and coalesce(employer_kind, 'direct_company') <> 'travel_agency') as companies,
              count(*) filter (where type = 'employer' and employer_kind = 'travel_agency') as agencies,
              count(*) filter (where type = 'recruitment_partner') as partners,
              count(*) filter (where type = 'institution') as institutions
            from organizations where deleted_at is null`)
      : skip<Record<string, unknown>>(),
    access.mobilisation
      ? first(
          sql`select count(*) as placed from placements where status <> 'cancelled' and placed_on >= ${istDayStart(now, 29).toISOString().slice(0, 10)}::date`,
        )
      : skip<Record<string, unknown>>(),
    access.cvs
      ? rows<{
          id: string;
          name: string;
          trade: string;
          code: string;
          source: string;
          requirement_title: string | null;
          created_at: Date | string;
        }>(sql`
            select id, name, trade_label as trade, code, source, requirement_title, created_at
            from cv_submissions order by created_at desc, id limit 6`)
      : skip<
          {
            id: string;
            name: string;
            trade: string;
            code: string;
            source: string;
            requirement_title: string | null;
            created_at: Date | string;
          }[]
        >(),
    access.bookings
      ? rows<{
          id: string;
          slot_id: string;
          name: string;
          seats: unknown;
          org: string | null;
          title: string;
          date: string;
          created_at: Date | string;
        }>(sql`
            select b.id, b.slot_id, b.name, b.seats, b.organization_name as org, s.title, to_char(s.date, 'YYYY-MM-DD') as date, b.created_at
            from slot_bookings b join booking_slots s on s.id = b.slot_id
            where b.status <> 'cancelled' order by b.created_at desc, b.id limit 6`)
      : skip<
          {
            id: string;
            slot_id: string;
            name: string;
            seats: unknown;
            org: string | null;
            title: string;
            date: string;
            created_at: Date | string;
          }[]
        >(),
    access.leads
      ? rows<{
          id: string;
          name: string;
          subject: string | null;
          type: string;
          organization_name: string | null;
          created_at: Date | string;
        }>(sql`
            select q.id, q.name, q.subject, q.type, q.organization_name, q.created_at
            from enquiries q where q.status <> 'spam' and ${enquiryVisible} order by q.created_at desc, q.id limit 6`)
      : skip<
          {
            id: string;
            name: string;
            subject: string | null;
            type: string;
            organization_name: string | null;
            created_at: Date | string;
          }[]
        >(),
    access.setup
      ? first(sql`
            select (select count(*) from cms_entries where collection = 'requirement_posts' and deleted_at is null and published_at is not null) as posters,
              (select count(*) from booking_slots) as slots,
              (select count(*) from cv_submissions) as cvs,
              (select count(distinct ur.user_id) from user_roles ur join roles r on r.id = ur.role_id
                where r.scope = 'platform' and ur.user_id <> ${ctx.user.id}) as other_staff`)
      : skip<Record<string, unknown>>(),
  ]);

  const money = (list: { currency: string; amount: unknown; cnt: unknown }[]): CurrencyAmount[] =>
    list.map((r) => ({
      currency: String(r.currency),
      amountMinor: n(r.amount),
      count: n(r.cnt),
    }));
  const toDate = (v: Date | string | null): Date | null => (v == null ? null : v instanceof Date ? v : new Date(v));

  const activity: ActivityItem[] = [
    ...(recentCvs ?? []).map((r): ActivityItem => ({
      id: `cv-${r.id}`,
      kind: "cv",
      title: r.name,
      meta: [
        r.trade,
        r.requirement_title ? `for ${r.requirement_title}` : r.source === "import" ? "Excel import" : r.source === "staff" ? "Added by staff" : "Website",
        r.code,
      ].join(" · "),
      at: toDate(r.created_at)!,
      href: `/admin/cv-submissions/${r.id}`,
    })),
    ...(recentBookings ?? []).map((r): ActivityItem => {
      const seats = n(r.seats);
      return {
        id: `booking-${r.id}`,
        kind: "booking",
        title: r.org ? `${r.org} (${seats} ${seats === 1 ? "seat" : "seats"})` : r.name,
        meta: `${r.title} · ${shortDate(r.date)}`,
        at: toDate(r.created_at)!,
        href: `/admin/bookings/${r.slot_id}`,
      };
    }),
    ...(recentEnquiries ?? []).map((r): ActivityItem => ({
      id: `enquiry-${r.id}`,
      kind: "enquiry",
      title: r.organization_name ? `${r.name}, ${r.organization_name}` : r.name,
      meta: r.subject?.trim() || ENQUIRY_TYPE_LABEL[r.type] || "Enquiry",
      at: toDate(r.created_at)!,
      href: `/admin/leads/enquiries/${r.id}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return {
    access,
    generatedAt: now,
    partial: failures > 0,
    tasks,
    cvs: cvCounts
      ? {
          today: n(cvCounts.today),
          week: n(cvCounts.week),
          toCallBack: n(cvCounts.to_call),
          expiringPassports: n(cvCounts.expiring),
          perDay: fillDailySeries(
            (perDay ?? []).map((r) => ({ day: r.day, count: n(r.count) })),
            now,
            CHART_DAYS,
          ),
          byTrade: (trades ?? []).map((r) => ({
            trade: r.trade,
            categoryId: r.category_id,
            count: n(r.count),
          })),
          tradeWindowTotal: n(trades?.[0]?.total),
        }
      : null,
    candidateCare: care ? { reviewsPending: n(care[0].pending), referralsDue: care[1] } : null,
    posters: posterCount
      ? {
          open: n(posterCount.open),
          items: (posterItems ?? []).map((r) => ({
            id: r.id,
            title: r.title,
            country: r.country,
            publishedAt: toDate(r.published_at),
            applicants: n(r.applicants),
            applicantsWeek: n(r.applicants_week),
          })),
        }
      : null,
    requirements: requirements
      ? {
          open: n(requirements.open),
          toReview: n(requirements.to_review),
          positionsOpen: n(requirements.positions_open),
        }
      : null,
    bookings: slotCounts
      ? {
          upcoming: n(slotCounts.upcoming),
          bookedSeats: n(slotCounts.booked),
          freeSeats: n(slotCounts.free),
          next: (nextSlots ?? []).map((r) => ({
            id: r.id,
            title: r.title,
            trade: r.trade,
            kind: r.kind,
            date: r.date,
            startTime: r.start_time,
            capacity: n(r.capacity),
            bookedSeats: n(r.booked_seats),
            status: r.status,
          })),
        }
      : null,
    approvalsOpen: approvals ? n(approvals.open) : null,
    jobs: jobs ? { active: n(jobs.active), pendingApproval: n(jobs.pending) } : null,
    support: support
      ? {
          open: n(support.open),
          grievances: access.grievances ? n(support.grievances) : null,
        }
      : null,
    leads: leads ? { open: n(leads.open), newEnquiries: n(leads.new_enquiries) } : null,
    money:
      unpaid && received
        ? {
            unpaid: money(unpaid),
            unpaidCount: unpaid.reduce((a, r) => a + n(r.cnt), 0),
            received30d: money(received),
          }
        : null,
    orgs: orgs
      ? {
          companies: n(orgs.companies),
          agencies: n(orgs.agencies),
          partners: n(orgs.partners),
          institutions: n(orgs.institutions),
        }
      : null,
    placements30d: placements ? n(placements.placed) : null,
    activity,
    setup: setup
      ? {
          posters: n(setup.posters),
          slots: n(setup.slots),
          cvs: n(setup.cvs),
          otherStaff: n(setup.other_staff),
        }
      : null,
  };
}

const ENQUIRY_TYPE_LABEL: Record<string, string> = {
  general: "General enquiry",
  employer: "Company enquiry",
  partner: "Partner enquiry",
  institution: "Institution enquiry",
  candidate_support: "Job seeker question",
  media: "Media enquiry",
  grievance: "Grievance",
  careers: "Careers at Venkat Sai",
};

const SHORT_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-12-03" → "Thu, 3 Dec" (a calendar date at the venue, no time-zone shift). */
export function shortDate(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoDay : SHORT_DATE.format(d);
}
