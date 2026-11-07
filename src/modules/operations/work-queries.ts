import "server-only";

import { and, count, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { tasks, users } from "@/db/schema";
import type { StaffTaskPriority, StaffTaskStatus } from "@/db/schema/operations";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { StaffContext } from "@/modules/identity/authz";

import type { StaffTaskRow } from "./work";

export type StaffTaskListFilters = {
  /** "mine" (assigned to me, default), "created" (by me) or "all". */
  scope?: "mine" | "created" | "all";
  status?: StaffTaskStatus | "open";
  priority?: StaffTaskPriority;
  due?: "overdue" | "today" | "week";
  relatedType?: string;
  relatedId?: string;
  organizationId?: string;
};

export type StaffTaskListItem = StaffTaskRow & { assigneeName: string | null; createdByName: string | null };

/** Internal tasks for any staff member (tasks are internal work items visible to the whole team). */
export async function listStaffTasks(ctx: StaffContext, filters: StaffTaskListFilters, page: PageQuery): Promise<Paginated<StaffTaskListItem>> {
  const now = new Date();
  const where: SQL[] = [];
  const scope = filters.scope ?? (filters.relatedId || filters.organizationId ? "all" : "mine");
  if (scope === "mine") where.push(eq(tasks.assignedToUserId, ctx.user.id));
  else if (scope === "created") where.push(eq(tasks.createdByUserId, ctx.user.id));
  if (filters.status === "open") where.push(inArray(tasks.status, ["todo", "in_progress"]));
  else if (filters.status) where.push(eq(tasks.status, filters.status));
  if (filters.priority) where.push(eq(tasks.priority, filters.priority));
  if (filters.relatedType) where.push(eq(tasks.relatedType, filters.relatedType));
  if (filters.relatedId) where.push(eq(tasks.relatedId, filters.relatedId));
  if (filters.organizationId) where.push(eq(tasks.organizationId, filters.organizationId));
  if (filters.due) {
    where.push(inArray(tasks.status, ["todo", "in_progress"]));
    if (filters.due === "overdue") where.push(lt(tasks.dueAt, now));
    else {
      const end = new Date(now);
      if (filters.due === "today") end.setUTCHours(23, 59, 59, 999);
      else end.setTime(now.getTime() + 7 * 86_400_000);
      where.push(or(lt(tasks.dueAt, end), eq(tasks.dueAt, end))!, gte(tasks.dueAt, new Date(now.getTime() - 365 * 86_400_000)));
    }
  }
  const condition = where.length ? and(...where) : undefined;
  const creator = alias(users, "creator");
  const [rows, totals] = await Promise.all([
    db
      .select({ task: tasks, assigneeName: users.displayName, createdByName: creator.displayName })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedToUserId))
      .leftJoin(creator, eq(creator.id, tasks.createdByUserId))
      .where(condition)
      .orderBy(sql`case when ${tasks.status} in ('todo', 'in_progress') then 0 else 1 end`, sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(tasks).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({ ...r.task, assigneeName: r.assigneeName ?? null, createdByName: r.createdByName ?? null })),
    totals[0]?.value ?? 0,
    page,
  );
}

export async function getStaffTask(ctx: StaffContext, id: string): Promise<StaffTaskListItem | null> {
  void ctx;
  const creator = alias(users, "creator");
  const [row] = await db
    .select({ task: tasks, assigneeName: users.displayName, createdByName: creator.displayName })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assignedToUserId))
    .leftJoin(creator, eq(creator.id, tasks.createdByUserId))
    .where(eq(tasks.id, id))
    .limit(1);
  return row ? { ...row.task, assigneeName: row.assigneeName ?? null, createdByName: row.createdByName ?? null } : null;
}

/** Open task counters for the signed-in staff member. */
export async function myTaskCounts(ctx: StaffContext): Promise<{ open: number; overdue: number }> {
  const [row] = await db
    .select({ open: count(), overdue: sql<number>`count(*) filter (where ${tasks.dueAt} < now())::int` })
    .from(tasks)
    .where(and(eq(tasks.assignedToUserId, ctx.user.id), inArray(tasks.status, ["todo", "in_progress"])));
  return { open: row?.open ?? 0, overdue: row?.overdue ?? 0 };
}
