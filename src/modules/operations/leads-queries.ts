import "server-only";

import { and, count, desc, eq, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { enquiries, leads, organizations, requirementRequests, users } from "@/db/schema";
import type { LeadSource, LeadStatus, LeadType } from "@/db/schema/operations";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { StaffContext } from "@/modules/identity/authz";

import { LEAD_STATUS_VALUES, OPEN_LEAD_STATUSES } from "./constants";
import { assertStaff, likePattern } from "./internal";
import type { LeadRow } from "./leads";

export type LeadListFilters = {
  status?: LeadStatus | "open";
  type?: LeadType;
  source?: LeadSource;
  /** "me", "unassigned" or a staff user id. */
  assignedTo?: string;
  /** Follow-up date reached. */
  followUpDue?: boolean;
  organizationId?: string;
  q?: string;
};

export type LeadListItem = Pick<
  LeadRow,
  "id" | "code" | "type" | "source" | "status" | "name" | "organizationName" | "email" | "phone" | "countryCode" | "nextFollowUpAt" | "lastContactedAt" | "createdAt" | "assignedToUserId"
> & { assigneeName: string | null };

export type LeadDetail = {
  lead: LeadRow;
  assigneeName: string | null;
  createdByName: string | null;
  organization: { id: string; name: string; type: string; status: string } | null;
  enquiries: { id: string; code: string; type: string; status: string; subject: string | null; createdAt: Date }[];
  requirements: { id: string; code: string; title: string; status: string; totalPositions: number; createdAt: Date }[];
};

/** Lead list for the Command Centre (leads.view). */
export async function listLeads(ctx: StaffContext, filters: LeadListFilters, page: PageQuery): Promise<Paginated<LeadListItem>> {
  assertStaff(ctx, "leads.view");
  const where: SQL[] = [];
  if (filters.status === "open") where.push(inArray(leads.status, [...OPEN_LEAD_STATUSES]));
  else if (filters.status) where.push(eq(leads.status, filters.status));
  if (filters.type) where.push(eq(leads.type, filters.type));
  if (filters.source) where.push(eq(leads.source, filters.source));
  if (filters.organizationId) where.push(eq(leads.organizationId, filters.organizationId));
  if (filters.assignedTo === "me") where.push(eq(leads.assignedToUserId, ctx.user.id));
  else if (filters.assignedTo === "unassigned") where.push(isNull(leads.assignedToUserId));
  else if (filters.assignedTo) where.push(eq(leads.assignedToUserId, filters.assignedTo));
  if (filters.followUpDue) where.push(lte(leads.nextFollowUpAt, new Date()), inArray(leads.status, [...OPEN_LEAD_STATUSES]));
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const pattern = likePattern(q);
    where.push(or(ilike(leads.name, pattern), ilike(leads.organizationName, pattern), ilike(leads.code, pattern), eq(leads.email, q.toLowerCase()), eq(leads.phone, q))!);
  }
  const condition = where.length ? and(...where) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: leads.id,
        code: leads.code,
        type: leads.type,
        source: leads.source,
        status: leads.status,
        name: leads.name,
        organizationName: leads.organizationName,
        email: leads.email,
        phone: leads.phone,
        countryCode: leads.countryCode,
        nextFollowUpAt: leads.nextFollowUpAt,
        lastContactedAt: leads.lastContactedAt,
        createdAt: leads.createdAt,
        assignedToUserId: leads.assignedToUserId,
        assigneeName: users.displayName,
      })
      .from(leads)
      .leftJoin(users, eq(users.id, leads.assignedToUserId))
      .where(condition)
      .orderBy(filters.followUpDue ? sql`${leads.nextFollowUpAt} asc nulls last` : desc(leads.createdAt), desc(leads.id))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(leads).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({ ...r, assigneeName: r.assigneeName ?? null })),
    totals[0]?.value ?? 0,
    page,
  );
}

/** One lead with its organisation link, enquiries and requirements (leads.view). Notes: listInternalNotes(). */
export async function getLead(ctx: StaffContext, id: string): Promise<LeadDetail | null> {
  assertStaff(ctx, "leads.view");
  const creator = alias(users, "creator");
  const [row] = await db
    .select({ lead: leads, assigneeName: users.displayName, createdByName: creator.displayName })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToUserId))
    .leftJoin(creator, eq(creator.id, leads.createdByUserId))
    .where(eq(leads.id, id))
    .limit(1);
  if (!row) return null;
  const [org, enquiryRows, requirementRows] = await Promise.all([
    row.lead.organizationId
      ? db
          .select({ id: organizations.id, name: organizations.name, type: organizations.type, status: organizations.status })
          .from(organizations)
          .where(eq(organizations.id, row.lead.organizationId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ id: enquiries.id, code: enquiries.code, type: enquiries.type, status: enquiries.status, subject: enquiries.subject, createdAt: enquiries.createdAt })
      .from(enquiries)
      .where(eq(enquiries.leadId, id))
      .orderBy(desc(enquiries.createdAt))
      .limit(50),
    db
      .select({ id: requirementRequests.id, code: requirementRequests.code, title: requirementRequests.title, status: requirementRequests.status, totalPositions: requirementRequests.totalPositions, createdAt: requirementRequests.createdAt })
      .from(requirementRequests)
      .where(eq(requirementRequests.leadId, id))
      .orderBy(desc(requirementRequests.createdAt))
      .limit(50),
  ]);
  return {
    lead: row.lead,
    assigneeName: row.assigneeName ?? null,
    createdByName: row.createdByName ?? null,
    organization: org[0] ?? null,
    enquiries: enquiryRows,
    requirements: requirementRows,
  };
}

/** Lead counts per status (pipeline board / dashboard). */
export async function leadPipelineCounts(ctx: StaffContext, opts: { assignedTo?: string } = {}): Promise<Record<LeadStatus, number>> {
  assertStaff(ctx, "leads.view");
  const rows = await db
    .select({ status: leads.status, value: count() })
    .from(leads)
    .where(opts.assignedTo ? eq(leads.assignedToUserId, opts.assignedTo === "me" ? ctx.user.id : opts.assignedTo) : undefined)
    .groupBy(leads.status);
  const counts = Object.fromEntries(LEAD_STATUS_VALUES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const r of rows) counts[r.status] = r.value;
  return counts;
}
