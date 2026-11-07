import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * Live counts for the Command Centre executive dashboard (spec 12.1). One round trip of scalar
 * sub-selects; every number is a real count — nothing estimated or seeded. Money is grouped per
 * currency and never summed across currencies. Callers hold dashboard.view; revenue figures are only
 * requested for staff with commercial.view.
 */

export type DashboardCounts = {
  users: number;
  usersNew30d: number;
  candidatesActive: number;
  candidatesVerified: number;
  employersVerified: number;
  employersTotal: number;
  partnersVerified: number;
  partnersTotal: number;
  institutionsVerified: number;
  jobsActive: number;
  jobsPendingApproval: number;
  applications: number;
  applications30d: number;
  shortlisted: number;
  interviewsUpcoming: number;
  interviews30d: number;
  placements: number;
  placements30d: number;
  enrolmentsActive: number;
  internshipApplications: number;
  approvalsOpen: number;
  ticketsOpen: number;
  grievancesOpen: number;
  requirementsOpen: number;
  leadsOpen: number;
};

const n = (v: unknown) => Number(v ?? 0);

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const res = await db.execute<Record<string, unknown>>(sql`
    select
      (select count(*) from users where status <> 'closed') as users,
      (select count(*) from users where created_at >= now() - interval '30 days') as users_new_30d,
      (select count(*) from candidate_profiles cp join users u on u.id = cp.user_id where u.status = 'active') as candidates_active,
      (select count(*) from candidate_profiles cp join users u on u.id = cp.user_id where u.status = 'active' and cp.verification_level <> 'none') as candidates_verified,
      (select count(*) from organizations where type = 'employer' and status = 'verified' and deleted_at is null) as employers_verified,
      (select count(*) from organizations where type = 'employer' and deleted_at is null) as employers_total,
      (select count(*) from organizations where type = 'recruitment_partner' and status = 'verified' and deleted_at is null) as partners_verified,
      (select count(*) from organizations where type = 'recruitment_partner' and deleted_at is null) as partners_total,
      (select count(*) from organizations where type = 'institution' and status = 'verified' and deleted_at is null) as institutions_verified,
      (select count(*) from jobs where status = 'published' and deleted_at is null and (published_at is null or published_at <= now())
         and (expires_at is null or expires_at > now()) and (application_deadline is null or application_deadline > now())) as jobs_active,
      (select count(*) from jobs where status = 'pending_approval' and deleted_at is null) as jobs_pending_approval,
      (select count(*) from applications) as applications,
      (select count(*) from applications where created_at >= now() - interval '30 days') as applications_30d,
      (select count(*) from applications where is_shortlisted and status = 'active') as shortlisted,
      (select count(*) from interviews where status in ('scheduled', 'rescheduled') and scheduled_start >= now()) as interviews_upcoming,
      (select count(*) from interviews where scheduled_start >= now() - interval '30 days' and scheduled_start < now() and status <> 'cancelled') as interviews_30d,
      (select count(*) from placements where status <> 'cancelled') as placements,
      (select count(*) from placements where status <> 'cancelled' and placed_on >= (now() - interval '30 days')::date) as placements_30d,
      (select count(*) from enrolments where status in ('confirmed', 'in_progress')) as enrolments_active,
      (select count(*) from applications a join jobs j on j.id = a.job_id where j.employment_type = 'internship') as internship_applications,
      (select count(*) from approval_requests where status in ('pending', 'in_review', 'escalated')) as approvals_open,
      (select count(*) from support_tickets where status in ('open', 'pending_staff', 'pending_requester', 'on_hold')) as tickets_open,
      (select count(*) from support_tickets where grievance_code is not null and status in ('open', 'pending_staff', 'pending_requester', 'on_hold')) as grievances_open,
      (select count(*) from requirement_requests where status in ('submitted', 'under_review', 'approved', 'sourcing', 'in_progress', 'partially_filled', 'on_hold')) as requirements_open,
      (select count(*) from leads where status in ('new', 'contacted', 'qualified', 'proposal', 'nurturing')) as leads_open
  `);
  const r = res.rows[0] ?? {};
  return {
    users: n(r.users),
    usersNew30d: n(r.users_new_30d),
    candidatesActive: n(r.candidates_active),
    candidatesVerified: n(r.candidates_verified),
    employersVerified: n(r.employers_verified),
    employersTotal: n(r.employers_total),
    partnersVerified: n(r.partners_verified),
    partnersTotal: n(r.partners_total),
    institutionsVerified: n(r.institutions_verified),
    jobsActive: n(r.jobs_active),
    jobsPendingApproval: n(r.jobs_pending_approval),
    applications: n(r.applications),
    applications30d: n(r.applications_30d),
    shortlisted: n(r.shortlisted),
    interviewsUpcoming: n(r.interviews_upcoming),
    interviews30d: n(r.interviews_30d),
    placements: n(r.placements),
    placements30d: n(r.placements_30d),
    enrolmentsActive: n(r.enrolments_active),
    internshipApplications: n(r.internship_applications),
    approvalsOpen: n(r.approvals_open),
    ticketsOpen: n(r.tickets_open),
    grievancesOpen: n(r.grievances_open),
    requirementsOpen: n(r.requirements_open),
    leadsOpen: n(r.leads_open),
  };
}

export type WeeklyTrends = { weeks: string[]; users: number[]; applications: number[]; jobs: number[]; placements: number[] };

/** Counts per ISO week for the last `weeks` weeks (oldest first, current week last, empty weeks = 0). */
export async function getWeeklyTrends(weeks = 12): Promise<WeeklyTrends> {
  const res = await db.execute<Record<string, unknown>>(sql`
    with w as (
      select generate_series(date_trunc('week', now()) - (${weeks - 1} * interval '1 week'), date_trunc('week', now()), interval '1 week') as week
    )
    select to_char(w.week, 'YYYY-MM-DD') as week,
      (select count(*) from users u where u.created_at >= w.week and u.created_at < w.week + interval '1 week') as users,
      (select count(*) from applications a where a.created_at >= w.week and a.created_at < w.week + interval '1 week') as applications,
      (select count(*) from jobs j where j.published_at >= w.week and j.published_at < w.week + interval '1 week' and j.deleted_at is null) as jobs,
      (select count(*) from placements p where p.placed_on >= w.week::date and p.placed_on < (w.week + interval '1 week')::date and p.status <> 'cancelled') as placements
    from w order by w.week
  `);
  const rows = res.rows;
  return {
    weeks: rows.map((r) => String(r.week)),
    users: rows.map((r) => n(r.users)),
    applications: rows.map((r) => n(r.applications)),
    jobs: rows.map((r) => n(r.jobs)),
    placements: rows.map((r) => n(r.placements)),
  };
}

export type CurrencyAmount = { currency: string; amountMinor: number; count: number };

/** Money received in the last 30 days (succeeded payments, net of refunds), per currency. */
export async function getRevenue30d(): Promise<CurrencyAmount[]> {
  const res = await db.execute<Record<string, unknown>>(sql`
    select currency, coalesce(sum(amount_minor - amount_refunded_minor), 0) as amount, count(*) as cnt
    from payments
    where status in ('succeeded', 'partially_refunded') and coalesce(received_at, created_at) >= now() - interval '30 days'
    group by currency order by currency
  `);
  return res.rows.map((r) => ({ currency: String(r.currency), amountMinor: n(r.amount), count: n(r.cnt) }));
}

/** Issued invoices with a balance (total − paid), per currency. Credit notes excluded. */
export async function getOutstandingInvoices(): Promise<CurrencyAmount[]> {
  const res = await db.execute<Record<string, unknown>>(sql`
    select currency, coalesce(sum(total_minor - amount_paid_minor), 0) as amount, count(*) as cnt
    from invoices
    where document_type = 'invoice' and status in ('issued', 'partially_paid', 'overdue') and total_minor > amount_paid_minor
    group by currency order by currency
  `);
  return res.rows.map((r) => ({ currency: String(r.currency), amountMinor: n(r.amount), count: n(r.cnt) }));
}

/** Live (trialing / active / past due / paused) subscriptions. */
export async function getActiveSubscriptionCount(): Promise<number> {
  const res = await db.execute<Record<string, unknown>>(sql`select count(*) as c from subscriptions where status in ('trialing', 'active', 'past_due', 'paused')`);
  return n(res.rows[0]?.c);
}
