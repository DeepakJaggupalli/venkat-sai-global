import "server-only";

import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { approvalEvents, approvalRequests, users, type ApprovalStatus, type ApprovalType } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { paginated, type PageQuery } from "@/lib/http";
import { audit } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { notify, notifyStaff } from "@/modules/notifications";

import { APPROVAL_TYPE_LABEL, APPROVAL_TYPE_PERMISSION, approvalHandlers } from "./registry";
import type { ApprovalDecision, ApprovalRequestRow } from "./types";

const OPEN_STATUSES: ApprovalStatus[] = ["pending", "in_review", "escalated", "changes_requested"];
const DECIDABLE_STATUSES: ApprovalStatus[] = ["pending", "in_review", "escalated"];

export type SubmitForApprovalInput = {
  type: ApprovalType;
  entityType: string;
  entityId: string;
  organizationId?: string | null;
  title: string;
  summary?: string | null;
  payload?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
  submittedByUserId?: string | null;
  dueAt?: Date | null;
};

/**
 * Put an entity into the approval centre. Idempotent per (type, entity):
 * - an open request is updated (and re-opened if it was "changes_requested");
 * - otherwise a new request (VSG-APR-xxxxxx) is created.
 */
export async function submitForApproval(input: SubmitForApprovalInput, tx?: DbOrTx): Promise<{ id: string; code: string; resubmitted: boolean }> {
  const run = async (t: DbOrTx) => {
    const existing = await t
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.type, input.type), eq(approvalRequests.entityId, input.entityId), inArray(approvalRequests.status, OPEN_STATUSES)))
      .limit(1);

    if (existing[0]) {
      const wasChangesRequested = existing[0].status === "changes_requested";
      await t
        .update(approvalRequests)
        .set({
          title: input.title,
          summary: input.summary ?? existing[0].summary,
          payload: input.payload ?? existing[0].payload,
          priority: input.priority ?? existing[0].priority,
          status: wasChangesRequested ? "pending" : existing[0].status,
          dueAt: input.dueAt ?? existing[0].dueAt,
        })
        .where(eq(approvalRequests.id, existing[0].id));
      await t.insert(approvalEvents).values({
        approvalRequestId: existing[0].id,
        action: "resubmitted",
        actorUserId: input.submittedByUserId ?? null,
      });
      return { id: existing[0].id, code: existing[0].code, resubmitted: true };
    }

    const code = await nextCode("APR", { tx: t });
    const [created] = await t
      .insert(approvalRequests)
      .values({
        code,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        organizationId: input.organizationId ?? null,
        title: input.title,
        summary: input.summary ?? null,
        payload: input.payload ?? {},
        priority: input.priority ?? "normal",
        submittedByUserId: input.submittedByUserId ?? null,
        dueAt: input.dueAt ?? null,
      })
      .returning({ id: approvalRequests.id, code: approvalRequests.code });
    await t.insert(approvalEvents).values({ approvalRequestId: created!.id, action: "submitted", actorUserId: input.submittedByUserId ?? null });
    await notifyStaff(
      {
        event: "approval.submitted",
        permission: APPROVAL_TYPE_PERMISSION[input.type],
        data: { code, type: APPROVAL_TYPE_LABEL[input.type], title: input.title },
        link: `/admin/approvals/${created!.id}`,
      },
      { tx: t },
    );
    return { id: created!.id, code: created!.code, resubmitted: false };
  };
  return tx ? run(tx) : db.transaction(run);
}

function assertCanDecide(ctx: StaffContext, type: ApprovalType) {
  if (!staffCan(ctx, ["approvals.decide", APPROVAL_TYPE_PERMISSION[type]])) {
    throw new ActionError("You do not have permission to decide this type of approval.");
  }
}

/** Approve / reject / request changes. Applies the decision to the entity atomically. */
export async function decideApproval(args: {
  requestId: string;
  decision: ApprovalDecision;
  reason?: string | null;
  ctx: StaffContext;
}): Promise<ApprovalRequestRow> {
  const reason = args.reason?.trim() || null;
  if (args.decision !== "approved" && !reason) {
    throw new ActionError("Please give a reason so the submitter knows what to do next.", { fieldErrors: { reason: ["A reason is required"] } });
  }

  const updated = await db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string }>(sql`select id from approval_requests where id = ${args.requestId} for update`);
    if (!locked.rows.length) throw new ActionError("Approval request not found.");
    const [request] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, args.requestId)).limit(1);
    if (!request) throw new ActionError("Approval request not found.");
    if (!DECIDABLE_STATUSES.includes(request.status)) throw new ActionError("This request has already been decided.");
    assertCanDecide(args.ctx, request.type);

    const [row] = await tx
      .update(approvalRequests)
      .set({ status: args.decision, decidedByUserId: args.ctx.user.id, decidedAt: new Date(), decisionReason: reason })
      .where(eq(approvalRequests.id, request.id))
      .returning();
    await tx.insert(approvalEvents).values({ approvalRequestId: request.id, action: args.decision, actorUserId: args.ctx.user.id, note: reason });

    const handler = approvalHandlers[request.type];
    if (handler) {
      await handler.onDecision({ request: row!, decision: args.decision, reason, actorUserId: args.ctx.user.id, tx });
    }

    if (request.submittedByUserId) {
      await notify(
        {
          event: "approval.decided",
          recipients: [{ userId: request.submittedByUserId }],
          data: { code: request.code, title: request.title, type: APPROVAL_TYPE_LABEL[request.type], decision: args.decision, reason },
        },
        { tx },
      );
    }
    await audit({
      action: `approval.${args.decision}`,
      entityType: request.entityType,
      entityId: request.entityId,
      organizationId: request.organizationId,
      metadata: { approvalRequestId: request.id, code: request.code, type: request.type, reason },
      tx,
    });
    return row!;
  });
  return updated;
}

export async function assignApproval(requestId: string, assigneeUserId: string | null, ctx: StaffContext): Promise<void> {
  if (!staffCan(ctx, "approvals.view")) throw new ActionError("Not allowed.");
  await db.transaction(async (tx) => {
    const [request] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).limit(1);
    if (!request || !OPEN_STATUSES.includes(request.status)) throw new ActionError("This request is no longer open.");
    await tx
      .update(approvalRequests)
      .set({ assignedToUserId: assigneeUserId, status: request.status === "pending" && assigneeUserId ? "in_review" : request.status })
      .where(eq(approvalRequests.id, requestId));
    await tx.insert(approvalEvents).values({ approvalRequestId: requestId, action: "assigned", actorUserId: ctx.user.id, metadata: { assigneeUserId } });
    if (assigneeUserId && assigneeUserId !== ctx.user.id) {
      await notify(
        { event: "approval.assigned", recipients: [{ userId: assigneeUserId }], data: { code: request.code, title: request.title }, link: `/admin/approvals/${requestId}` },
        { tx },
      );
    }
  });
}

export async function escalateApproval(requestId: string, note: string, ctx: StaffContext, escalateToUserId?: string | null): Promise<void> {
  if (!staffCan(ctx, "approvals.escalate")) throw new ActionError("You do not have permission to escalate approvals.");
  await db.transaction(async (tx) => {
    const [request] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).limit(1);
    if (!request || !DECIDABLE_STATUSES.includes(request.status)) throw new ActionError("This request is no longer open.");
    await tx
      .update(approvalRequests)
      .set({ status: "escalated", priority: request.priority === "urgent" ? "urgent" : "high", assignedToUserId: escalateToUserId ?? request.assignedToUserId })
      .where(eq(approvalRequests.id, requestId));
    await tx.insert(approvalEvents).values({ approvalRequestId: requestId, action: "escalated", actorUserId: ctx.user.id, note, metadata: { escalateToUserId } });
    if (escalateToUserId) {
      await notify(
        { event: "approval.assigned", recipients: [{ userId: escalateToUserId }], data: { code: request.code, title: request.title, escalated: true }, link: `/admin/approvals/${requestId}` },
        { tx },
      );
    }
    await audit({ action: "approval.escalated", entityType: request.entityType, entityId: request.entityId, metadata: { approvalRequestId: requestId, note }, tx });
  });
}

export async function commentOnApproval(requestId: string, note: string, ctx: StaffContext): Promise<void> {
  if (!staffCan(ctx, "approvals.view")) throw new ActionError("Not allowed.");
  await db.insert(approvalEvents).values({ approvalRequestId: requestId, action: "commented", actorUserId: ctx.user.id, note });
}

/** Cancel open requests for an entity (e.g. the submitter withdrew or deleted it). */
export async function cancelApprovalsForEntity(type: ApprovalType, entityId: string, actorUserId: string | null, note?: string, tx?: DbOrTx) {
  const t = tx ?? db;
  const open = await t
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(and(eq(approvalRequests.type, type), eq(approvalRequests.entityId, entityId), inArray(approvalRequests.status, OPEN_STATUSES)));
  for (const r of open) {
    await t.update(approvalRequests).set({ status: "cancelled" }).where(eq(approvalRequests.id, r.id));
    await t.insert(approvalEvents).values({ approvalRequestId: r.id, action: "cancelled", actorUserId, note: note ?? null });
  }
}

export async function getOpenApprovalForEntity(type: ApprovalType, entityId: string) {
  const rows = await db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.type, type), eq(approvalRequests.entityId, entityId), inArray(approvalRequests.status, OPEN_STATUSES)))
    .limit(1);
  return rows[0] ?? null;
}

/** Latest request (any status) for an entity — lets portals show "rejected: <reason>". */
export async function getLatestApprovalForEntity(type: ApprovalType, entityId: string) {
  const rows = await db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.type, type), eq(approvalRequests.entityId, entityId)))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export type ApprovalListFilters = {
  status?: ApprovalStatus | "open";
  type?: ApprovalType;
  assignedToUserId?: string;
  search?: string;
};

export async function listApprovals(filters: ApprovalListFilters, page: PageQuery) {
  const where: SQL[] = [];
  if (filters.status === "open") where.push(inArray(approvalRequests.status, OPEN_STATUSES));
  else if (filters.status) where.push(eq(approvalRequests.status, filters.status));
  if (filters.type) where.push(eq(approvalRequests.type, filters.type));
  if (filters.assignedToUserId) where.push(eq(approvalRequests.assignedToUserId, filters.assignedToUserId));
  if (filters.search) {
    const q = `%${filters.search.replace(/[%_]/g, "")}%`;
    where.push(sql`(${approvalRequests.title} ilike ${q} or ${approvalRequests.code} ilike ${q})`);
  }
  const condition = where.length ? and(...where) : undefined;
  const [items, totalRows] = await Promise.all([
    db
      .select({
        request: approvalRequests,
        submitterName: users.displayName,
      })
      .from(approvalRequests)
      .leftJoin(users, eq(users.id, approvalRequests.submittedByUserId))
      .where(condition)
      .orderBy(
        sql`case ${approvalRequests.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
        desc(approvalRequests.createdAt),
      )
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(approvalRequests).where(condition),
  ]);
  return paginated(items, totalRows[0]?.value ?? 0, page);
}

export async function getApprovalWithEvents(requestId: string) {
  const [request] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).limit(1);
  if (!request) return null;
  const events = await db
    .select({ event: approvalEvents, actorName: users.displayName })
    .from(approvalEvents)
    .leftJoin(users, eq(users.id, approvalEvents.actorUserId))
    .where(eq(approvalEvents.approvalRequestId, requestId))
    .orderBy(approvalEvents.createdAt);
  const handler = approvalHandlers[request.type];
  return { request, events, adminHref: handler?.adminHref?.(request) ?? null };
}

export async function countOpenApprovals(): Promise<number> {
  const rows = await db.select({ value: count() }).from(approvalRequests).where(inArray(approvalRequests.status, DECIDABLE_STATUSES));
  return rows[0]?.value ?? 0;
}
