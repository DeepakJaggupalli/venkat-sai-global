import "server-only";

import { and, count, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  applications,
  interviews,
  invoices,
  jobs,
  offers,
  OFFER_STATUSES,
  placements,
  PLACEMENT_STATUSES,
  requirementRequests,
  REQUIREMENT_STATUSES,
  type InterviewStatus,
  type OfferStatus,
  type PlacementStatus,
  type RequirementStatus,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { PAYABLE_STATUSES } from "@/modules/commercial/invoices";
import { orgCan, type OrgContext } from "@/modules/identity/authz";

/**
 * Small read models for the Company / Travel Agency Portal dashboard: one GROUP BY per area, always scoped to the
 * member's organisation and to what its role may see (the same rules as the list pages these numbers link to).
 */

type EmployerCtx = OrgContext<"employer">;

function forbid(): never {
  throw new ActionError("You do not have permission to see this.", { code: "forbidden" });
}

/** Statuses of a manpower request that are still being worked on (drafts are counted apart). */
export const OPEN_REQUIREMENT_STATUSES: readonly RequirementStatus[] = ["submitted", "under_review", "approved", "sourcing", "in_progress", "partially_filled", "on_hold"];

/** Interviews that count for "this week" (cancelled ones do not). */
const COUNTED_INTERVIEW_STATUSES: readonly InterviewStatus[] = ["scheduled", "rescheduled", "completed", "no_show"];

function zeroes<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

export type RequirementSummary = {
  byStatus: Record<RequirementStatus, number>;
  /** Requests still being worked on (not drafts, not filled / cancelled / closed). */
  open: number;
  /** Positions on those open requests. */
  openPositions: number;
  drafts: number;
  total: number;
};

/** Manpower requests of the organisation by status (same access rule as the requirement list). */
export async function getRequirementSummary(ctx: EmployerCtx): Promise<RequirementSummary> {
  if (!orgCan(ctx, ["employer.requirements.manage", "employer.dashboard"], "any")) forbid();
  const rows = await db
    .select({ status: requirementRequests.status, value: count(), positions: sql<string>`coalesce(sum(${requirementRequests.totalPositions}), 0)` })
    .from(requirementRequests)
    .where(eq(requirementRequests.organizationId, ctx.organization.id))
    .groupBy(requirementRequests.status);
  const byStatus = zeroes(REQUIREMENT_STATUSES);
  let open = 0;
  let openPositions = 0;
  let total = 0;
  for (const row of rows) {
    const n = Number(row.value);
    byStatus[row.status] = n;
    total += n;
    if (OPEN_REQUIREMENT_STATUSES.includes(row.status)) {
      open += n;
      openPositions += Number(row.positions);
    }
  }
  return { byStatus, open, openPositions, drafts: byStatus.draft, total };
}

/** Interviews (not cancelled) on applications shared with the organisation, starting in [from, to). */
export async function countInterviewsBetween(ctx: EmployerCtx, from: Date, to: Date): Promise<number> {
  if (!orgCan(ctx, ["employer.interviews.manage", "employer.pipeline.view"], "any")) forbid();
  const [row] = await db
    .select({ value: count() })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(jobs.organizationId, ctx.organization.id),
        isNotNull(applications.sharedWithEmployerAt),
        inArray(interviews.status, [...COUNTED_INTERVIEW_STATUSES]),
        gte(interviews.scheduledStart, from),
        lt(interviews.scheduledStart, to),
      ),
    );
  return Number(row?.value ?? 0);
}

/** Offers on the organisation's shared applications, by status (same access rule as the offers page). */
export async function countOffersByStatus(ctx: EmployerCtx): Promise<Record<OfferStatus, number>> {
  if (!orgCan(ctx, "employer.offers.manage")) forbid();
  const rows = await db
    .select({ status: offers.status, value: count() })
    .from(offers)
    .innerJoin(applications, eq(applications.id, offers.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(jobs.organizationId, ctx.organization.id), isNotNull(applications.sharedWithEmployerAt)))
    .groupBy(offers.status);
  const out = zeroes(OFFER_STATUSES);
  for (const row of rows) out[row.status] = Number(row.value);
  return out;
}

/** Placements of the organisation by status (same access rule as the placements tab). */
export async function countPlacementsByStatus(ctx: EmployerCtx): Promise<Record<PlacementStatus, number>> {
  if (!orgCan(ctx, ["employer.offers.manage", "employer.pipeline.view"], "any")) forbid();
  const rows = await db
    .select({ status: placements.status, value: count() })
    .from(placements)
    .where(eq(placements.organizationId, ctx.organization.id))
    .groupBy(placements.status);
  const out = zeroes(PLACEMENT_STATUSES);
  for (const row of rows) out[row.status] = Number(row.value);
  return out;
}

/** Issued invoices of the organisation that still have money due (any currency). */
export async function countUnpaidInvoices(ctx: EmployerCtx): Promise<number> {
  if (!orgCan(ctx, "employer.billing.view")) forbid();
  const [row] = await db
    .select({ value: count() })
    .from(invoices)
    .where(and(eq(invoices.organizationId, ctx.organization.id), eq(invoices.documentType, "invoice"), inArray(invoices.status, [...PAYABLE_STATUSES])));
  return Number(row?.value ?? 0);
}
