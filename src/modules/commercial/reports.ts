import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { env } from "@/lib/env";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./access";
import { roundDiv } from "./money";

/**
 * Revenue reporting (commercial.reports). Every figure is grouped by currency — amounts in different currencies are
 * never added or compared. Months are calendar months in the platform time zone (DEFAULT_TIMEZONE, Asia/Kolkata by
 * default). Only real records are counted; empty periods are simply absent (no placeholder figures).
 */

export type DateRange = { from: Date; to: Date };

function tz(): string {
  const zone = env().DEFAULT_TIMEZONE;
  return /^[A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2}$/.test(zone) ? zone : "Asia/Kolkata";
}

export type RevenueMonthRow = {
  month: string;
  currency: string;
  /** Invoices issued (net of discounts, incl. tax). */
  invoicedMinor: number;
  /** Credit notes issued. */
  creditedMinor: number;
  netInvoicedMinor: number;
  /** Tax on invoices less tax on credit notes. */
  netTaxMinor: number;
  /** Money received (succeeded payments by received date). */
  collectedMinor: number;
  /** Refunds completed (by processed date). */
  refundedMinor: number;
};

/** Invoiced, credited, collected and refunded amounts per month and currency. */
export async function revenueByMonth(ctx: StaffContext, range: DateRange): Promise<RevenueMonthRow[]> {
  assertStaff(ctx, "commercial.reports");
  const zone = tz();
  const result = await db.execute<{ month: string; currency: string; invoiced: string; credited: string; invoiced_tax: string; credited_tax: string; collected: string; refunded: string }>(sql`
    with docs as (
      select to_char(issued_at at time zone ${zone}, 'YYYY-MM') as month, currency,
        sum(case when document_type = 'invoice' then total_minor else 0 end) as invoiced,
        sum(case when document_type = 'credit_note' then total_minor else 0 end) as credited,
        sum(case when document_type = 'invoice' then tax_minor else 0 end) as invoiced_tax,
        sum(case when document_type = 'credit_note' then tax_minor else 0 end) as credited_tax
      from invoices
      where status <> 'draft' and status <> 'void' and issued_at >= ${range.from} and issued_at < ${range.to}
      group by 1, 2
    ), cash as (
      select to_char(received_at at time zone ${zone}, 'YYYY-MM') as month, currency, sum(amount_minor) as collected
      from payments
      where status in ('succeeded', 'partially_refunded', 'refunded') and received_at >= ${range.from} and received_at < ${range.to}
      group by 1, 2
    ), back as (
      select to_char(processed_at at time zone ${zone}, 'YYYY-MM') as month, currency, sum(amount_minor) as refunded
      from refunds
      where status = 'completed' and processed_at >= ${range.from} and processed_at < ${range.to}
      group by 1, 2
    ), keys as (
      select month, currency from docs union select month, currency from cash union select month, currency from back
    )
    select k.month, k.currency,
      coalesce(d.invoiced, 0)::text as invoiced, coalesce(d.credited, 0)::text as credited,
      coalesce(d.invoiced_tax, 0)::text as invoiced_tax, coalesce(d.credited_tax, 0)::text as credited_tax,
      coalesce(c.collected, 0)::text as collected, coalesce(b.refunded, 0)::text as refunded
    from keys k
    left join docs d on d.month = k.month and d.currency = k.currency
    left join cash c on c.month = k.month and c.currency = k.currency
    left join back b on b.month = k.month and b.currency = k.currency
    order by k.month, k.currency
  `);
  return result.rows.map((r) => {
    const invoicedMinor = Number(r.invoiced);
    const creditedMinor = Number(r.credited);
    return {
      month: r.month,
      currency: r.currency,
      invoicedMinor,
      creditedMinor,
      netInvoicedMinor: invoicedMinor - creditedMinor,
      netTaxMinor: Number(r.invoiced_tax) - Number(r.credited_tax),
      collectedMinor: Number(r.collected),
      refundedMinor: Number(r.refunded),
    };
  });
}

export type OutstandingRow = {
  currency: string;
  invoices: number;
  outstandingMinor: number;
  /** Not yet due. */
  currentMinor: number;
  overdue1to30Minor: number;
  overdue31to60Minor: number;
  overdue61to90Minor: number;
  overdueOver90Minor: number;
};

/** Receivables per currency with ageing buckets (days past the due date). */
export async function outstandingInvoices(ctx: StaffContext, now: Date = new Date()): Promise<OutstandingRow[]> {
  assertStaff(ctx, ["commercial.reports", "commercial.view"], "any");
  const result = await db.execute<{ currency: string; invoices: string; outstanding: string; current: string; d30: string; d60: string; d90: string; over: string }>(sql`
    with open as (
      select currency, total_minor - amount_paid_minor as due,
        greatest(0, extract(epoch from (${now}::timestamptz - coalesce(due_at, ${now}::timestamptz))) / 86400) as days
      from invoices
      where document_type = 'invoice' and status in ('issued', 'partially_paid', 'overdue') and total_minor > amount_paid_minor
    )
    select currency, count(*)::text as invoices, sum(due)::text as outstanding,
      sum(case when days = 0 then due else 0 end)::text as current,
      sum(case when days > 0 and days <= 30 then due else 0 end)::text as d30,
      sum(case when days > 30 and days <= 60 then due else 0 end)::text as d60,
      sum(case when days > 60 and days <= 90 then due else 0 end)::text as d90,
      sum(case when days > 90 then due else 0 end)::text as over
    from open group by currency order by currency
  `);
  return result.rows.map((r) => ({
    currency: r.currency,
    invoices: Number(r.invoices),
    outstandingMinor: Number(r.outstanding),
    currentMinor: Number(r.current),
    overdue1to30Minor: Number(r.d30),
    overdue31to60Minor: Number(r.d60),
    overdue61to90Minor: Number(r.d90),
    overdueOver90Minor: Number(r.over),
  }));
}

export type SubscriptionsByPlanRow = {
  planId: string;
  planName: string;
  audience: string;
  kind: string;
  trialing: number;
  active: number;
  pastDue: number;
  /** Monthly-equivalent recurring amount of active + past-due subscriptions, per currency. */
  monthlyRecurring: { currency: string; amountMinor: number }[];
};

/** Live subscriptions per plan (counts by status) and their monthly-equivalent recurring amount per currency. */
export async function activeSubscriptionsByPlan(ctx: StaffContext): Promise<SubscriptionsByPlanRow[]> {
  assertStaff(ctx, ["commercial.reports", "commercial.view"], "any");
  const result = await db.execute<{ plan_id: string; plan_name: string; audience: string; kind: string; status: string; currency: string | null; interval: string | null; amount_minor: string | null; n: string }>(sql`
    select p.id as plan_id, p.name as plan_name, p.audience, p.kind, s.status, s.currency, s.interval, s.amount_minor::text as amount_minor, count(*)::text as n
    from subscriptions s join plans p on p.id = s.plan_id
    where s.status in ('trialing', 'active', 'past_due')
    group by p.id, p.name, p.audience, p.kind, s.status, s.currency, s.interval, s.amount_minor
    order by p.audience, p.name
  `);
  const MONTHS: Record<string, number> = { month: 1, quarter: 3, year: 12 };
  const map = new Map<string, SubscriptionsByPlanRow & { recurring: Map<string, number> }>();
  for (const r of result.rows) {
    const entry = map.get(r.plan_id) ?? { planId: r.plan_id, planName: r.plan_name, audience: r.audience, kind: r.kind, trialing: 0, active: 0, pastDue: 0, monthlyRecurring: [], recurring: new Map<string, number>() };
    const n = Number(r.n);
    if (r.status === "trialing") entry.trialing += n;
    else if (r.status === "active") entry.active += n;
    else if (r.status === "past_due") entry.pastDue += n;
    if (r.status !== "trialing" && r.currency && r.interval && MONTHS[r.interval] && r.amount_minor) {
      // Monthly equivalent per subscription, rounded half away from zero at the minor unit.
      const perMonth = Number(roundDiv(BigInt(r.amount_minor), BigInt(MONTHS[r.interval]!)));
      entry.recurring.set(r.currency, (entry.recurring.get(r.currency) ?? 0) + perMonth * n);
    }
    map.set(r.plan_id, entry);
  }
  return [...map.values()].map(({ recurring, ...row }) => ({ ...row, monthlyRecurring: [...recurring.entries()].sort().map(([currency, amountMinor]) => ({ currency, amountMinor })) }));
}

export type PaymentsByProviderRow = { provider: string; currency: string; payments: number; amountMinor: number; refundedMinor: number; feesMinor: number; failed: number };

/** Received payments per provider and currency in a date range (plus failed attempts). */
export async function paymentsByProvider(ctx: StaffContext, range: DateRange): Promise<PaymentsByProviderRow[]> {
  assertStaff(ctx, "commercial.reports");
  const result = await db.execute<{ provider: string; currency: string; payments: string; amount: string; refunded: string; fees: string; failed: string }>(sql`
    select provider, currency,
      count(*) filter (where status in ('succeeded', 'partially_refunded', 'refunded'))::text as payments,
      coalesce(sum(amount_minor) filter (where status in ('succeeded', 'partially_refunded', 'refunded')), 0)::text as amount,
      coalesce(sum(amount_refunded_minor), 0)::text as refunded,
      coalesce(sum(provider_fee_minor) filter (where status in ('succeeded', 'partially_refunded', 'refunded')), 0)::text as fees,
      count(*) filter (where status = 'failed')::text as failed
    from payments
    where coalesce(received_at, created_at) >= ${range.from} and coalesce(received_at, created_at) < ${range.to}
    group by provider, currency
    order by provider, currency
  `);
  return result.rows.map((r) => ({ provider: r.provider, currency: r.currency, payments: Number(r.payments), amountMinor: Number(r.amount), refundedMinor: Number(r.refunded), feesMinor: Number(r.fees), failed: Number(r.failed) }));
}
