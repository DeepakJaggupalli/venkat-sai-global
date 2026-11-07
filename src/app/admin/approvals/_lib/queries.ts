import "server-only";

import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/db";
import { APPROVAL_STATUSES, APPROVAL_TYPES, approvalRequests, organizations, users } from "@/db/schema";
import { paginated, type PageQuery } from "@/lib/http";
import type { StaffContext } from "@/modules/identity/authz";

/**
 * Approval-centre list with the filters the module's listApprovals() lacks (priority, unassigned,
 * "assigned to me"). Read-only; callers hold approvals.view. Reported as a cross-module need.
 */
export const OPEN_APPROVAL_STATUSES = ["pending", "in_review", "escalated", "changes_requested"] as const;
export const DECIDABLE_APPROVAL_STATUSES = ["pending", "in_review", "escalated"] as const;

export const approvalFiltersSchema = z.object({
  status: z.enum([...APPROVAL_STATUSES, "open", "all"]).catch("open").default("open"),
  type: z.enum(APPROVAL_TYPES).optional().catch(undefined),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().catch(undefined),
  assignee: z.string().max(40).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type ApprovalFilters = z.output<typeof approvalFiltersSchema>;

export async function listApprovalInbox(ctx: StaffContext, filters: ApprovalFilters, page: PageQuery) {
  const where: SQL[] = [];
  if (filters.status === "open") where.push(inArray(approvalRequests.status, [...OPEN_APPROVAL_STATUSES]));
  else if (filters.status !== "all") where.push(eq(approvalRequests.status, filters.status));
  if (filters.type) where.push(eq(approvalRequests.type, filters.type));
  if (filters.priority) where.push(eq(approvalRequests.priority, filters.priority));
  if (filters.assignee === "me") where.push(eq(approvalRequests.assignedToUserId, ctx.user.id));
  else if (filters.assignee === "unassigned") where.push(isNull(approvalRequests.assignedToUserId));
  else if (filters.assignee && z.uuid().safeParse(filters.assignee).success) where.push(eq(approvalRequests.assignedToUserId, filters.assignee));
  if (filters.q) {
    const q = `%${filters.q.replace(/[%_\\]/g, "")}%`;
    where.push(sql`(${approvalRequests.title} ilike ${q} or ${approvalRequests.code} ilike ${q})`);
  }
  const condition = where.length ? and(...where) : undefined;
  const submitter = alias(users, "submitter");
  const assignee = alias(users, "assignee");
  const [items, totals] = await Promise.all([
    db
      .select({
        id: approvalRequests.id,
        code: approvalRequests.code,
        type: approvalRequests.type,
        status: approvalRequests.status,
        priority: approvalRequests.priority,
        title: approvalRequests.title,
        createdAt: approvalRequests.createdAt,
        dueAt: approvalRequests.dueAt,
        organizationName: organizations.name,
        submitterName: submitter.displayName,
        assigneeName: assignee.displayName,
      })
      .from(approvalRequests)
      .leftJoin(submitter, eq(submitter.id, approvalRequests.submittedByUserId))
      .leftJoin(assignee, eq(assignee.id, approvalRequests.assignedToUserId))
      .leftJoin(organizations, eq(organizations.id, approvalRequests.organizationId))
      .where(condition)
      .orderBy(
        sql`case when ${approvalRequests.status} in ('pending','in_review','escalated') then 0 else 1 end`,
        sql`case ${approvalRequests.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
        desc(approvalRequests.createdAt),
      )
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(approvalRequests).where(condition),
  ]);
  return paginated(items, totals[0]?.value ?? 0, page);
}

export type ApprovalInboxItem = Awaited<ReturnType<typeof listApprovalInbox>>["items"][number];

/** Open counts per type for the inbox summary. */
export async function openApprovalCountsByType() {
  const rows = await db
    .select({ type: approvalRequests.type, value: count() })
    .from(approvalRequests)
    .where(inArray(approvalRequests.status, [...DECIDABLE_APPROVAL_STATUSES]))
    .groupBy(approvalRequests.type);
  return rows;
}

/** Organisation summary for the detail header. */
export async function approvalOrganization(id: string | null) {
  if (!id) return null;
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name, type: organizations.type, status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  return row ?? null;
}
