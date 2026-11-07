import "server-only";

import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { messages, messageThreadParticipants, messageThreads, users } from "@/db/schema";
import type { MessageThreadContextType, MessageThreadStatus } from "@/db/schema/operations";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { getFiles, toFileSummary, type FileSummary } from "@/modules/files";

import { THREAD_CONTEXT_VALUES } from "./constants";
import { ORG_THREAD_PERMISSION, THREAD_CONTEXT_STAFF_PERMISSION } from "./thread-access";
import { actorUser, loadThreadWithAccess, type ThreadActor, type ThreadRow } from "./threads";

export type ThreadListFilters = {
  status?: MessageThreadStatus;
  contextType?: MessageThreadContextType;
  contextId?: string;
  unreadOnly?: boolean;
};

export type ThreadListItem = Pick<ThreadRow, "id" | "subject" | "contextType" | "contextId" | "organizationId" | "status" | "lastMessageAt" | "createdAt"> & {
  unreadCount: number;
  isMuted: boolean;
};

export type ThreadMessageView = {
  id: string;
  authorUserId: string | null;
  authorName: string;
  isOwn: boolean;
  isSystem: boolean;
  removed: boolean;
  body: string;
  attachments: FileSummary[];
  createdAt: Date;
};

export type ThreadDetail = {
  thread: ThreadRow;
  canPost: boolean;
  participants: { userId: string; displayName: string; organizationId: string | null; isStaff: boolean; removed: boolean }[];
  messages: ThreadMessageView[];
};

/**
 * Drizzle renders columns of single-table queries unqualified inside raw select expressions, which would bind
 * to the subquery's own tables — so the outer thread id is always written fully qualified.
 */
const THREAD_ID = sql.raw(`"message_threads"."id"`);

/** Threads visible to the actor, scoped exactly like thread-access.ts. */
function visibilityCondition(actor: ThreadActor, userId: string): SQL | null {
  const isParticipant = sql`exists (select 1 from message_thread_participants p where p.thread_id = ${THREAD_ID} and p.user_id = ${userId} and p.removed_at is null)`;
  if (actor.kind === "staff") {
    const contexts = THREAD_CONTEXT_VALUES.filter((c) => actor.ctx.permissions.has(THREAD_CONTEXT_STAFF_PERMISSION[c]));
    return contexts.length ? or(isParticipant, inArray(messageThreads.contextType, contexts))! : isParticipant;
  }
  if (actor.kind === "org") {
    const needed = ORG_THREAD_PERMISSION[actor.ctx.orgType];
    if (needed && !actor.ctx.permissions.has(needed)) return null;
    return eq(messageThreads.organizationId, actor.ctx.organization.id);
  }
  return sql`exists (select 1 from message_thread_participants p where p.thread_id = ${THREAD_ID} and p.user_id = ${userId} and p.removed_at is null and p.organization_id is null)`;
}

function unreadExpression(userId: string) {
  return sql<number>`(
    select count(*)::int from messages m
    where m.thread_id = ${THREAD_ID} and m.deleted_at is null and (m.author_user_id is null or m.author_user_id <> ${userId})
      and m.created_at > coalesce((select p.last_read_at from message_thread_participants p where p.thread_id = ${THREAD_ID} and p.user_id = ${userId}), '-infinity'::timestamptz)
  )`;
}

/** Conversations of the actor, latest activity first, with their own unread count per thread. */
export async function listThreads(actor: ThreadActor, filters: ThreadListFilters, page: PageQuery): Promise<Paginated<ThreadListItem>> {
  const user = actorUser(actor);
  const visible = visibilityCondition(actor, user.id);
  if (!visible) return paginated([], 0, page);
  const where: SQL[] = [visible];
  if (filters.status) where.push(eq(messageThreads.status, filters.status));
  if (filters.contextType) where.push(eq(messageThreads.contextType, filters.contextType));
  if (filters.contextId) where.push(eq(messageThreads.contextId, filters.contextId));
  const unread = unreadExpression(user.id);
  if (filters.unreadOnly) where.push(sql`${unread} > 0`);
  const condition = and(...where);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: messageThreads.id,
        subject: messageThreads.subject,
        contextType: messageThreads.contextType,
        contextId: messageThreads.contextId,
        organizationId: messageThreads.organizationId,
        status: messageThreads.status,
        lastMessageAt: messageThreads.lastMessageAt,
        createdAt: messageThreads.createdAt,
        unreadCount: unread,
        isMuted: sql<boolean>`coalesce((select p.is_muted from message_thread_participants p where p.thread_id = ${THREAD_ID} and p.user_id = ${user.id}), false)`,
      })
      .from(messageThreads)
      .where(condition)
      .orderBy(desc(sql`coalesce(${messageThreads.lastMessageAt}, ${messageThreads.createdAt})`), desc(messageThreads.id))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(messageThreads).where(condition),
  ]);
  return paginated(rows, totals[0]?.value ?? 0, page);
}

/** Number of conversations with unread messages (navigation badge). */
export async function unreadThreadCount(actor: ThreadActor): Promise<number> {
  const user = actorUser(actor);
  const visible = visibilityCondition(actor, user.id);
  if (!visible) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(messageThreads)
    .where(and(visible, sql`${unreadExpression(user.id)} > 0`));
  return row?.value ?? 0;
}

/** A conversation with its messages (removed messages keep their place without their text) and participants. */
export async function getThread(actor: ThreadActor, threadId: string, opts: { limit?: number } = {}): Promise<ThreadDetail | null> {
  const user = actorUser(actor);
  let loaded: Awaited<ReturnType<typeof loadThreadWithAccess>>;
  try {
    loaded = await loadThreadWithAccess(db, actor, threadId);
  } catch {
    return null;
  }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const [messageRows, participantRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        authorUserId: messages.authorUserId,
        authorName: users.displayName,
        isStaff: users.isStaff,
        isSystem: messages.isSystem,
        body: messages.body,
        attachmentFileIds: messages.attachmentFileIds,
        deletedAt: messages.deletedAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorUserId))
      .where(eq(messages.threadId, threadId))
      .orderBy(desc(messages.createdAt))
      .limit(limit),
    db
      .select({
        userId: messageThreadParticipants.userId,
        displayName: users.displayName,
        organizationId: messageThreadParticipants.organizationId,
        isStaff: users.isStaff,
        removedAt: messageThreadParticipants.removedAt,
      })
      .from(messageThreadParticipants)
      .innerJoin(users, eq(users.id, messageThreadParticipants.userId))
      .where(eq(messageThreadParticipants.threadId, threadId))
      .orderBy(asc(messageThreadParticipants.createdAt)),
  ]);
  const visibleMessages = messageRows.reverse();
  const fileIds = [...new Set(visibleMessages.filter((m) => !m.deletedAt).flatMap((m) => m.attachmentFileIds))];
  const files = fileIds.length ? new Map((await getFiles(fileIds)).map((f) => [f.id, toFileSummary(f)])) : new Map<string, FileSummary>();
  return {
    thread: loaded.thread,
    canPost: loaded.access.canPost,
    participants: participantRows.map((p) => ({ userId: p.userId, displayName: p.displayName, organizationId: p.organizationId, isStaff: p.isStaff, removed: Boolean(p.removedAt) })),
    messages: visibleMessages.map((m) => ({
      id: m.id,
      authorUserId: m.authorUserId,
      authorName: m.isSystem ? "Venkat Sai Global" : (m.authorName ?? "Former user"),
      isOwn: m.authorUserId === user.id,
      isSystem: m.isSystem,
      removed: Boolean(m.deletedAt),
      body: m.deletedAt ? "" : m.body,
      attachments: m.deletedAt ? [] : m.attachmentFileIds.map((id) => files.get(id)).filter((f): f is FileSummary => Boolean(f)),
      createdAt: m.createdAt,
    })),
  };
}

/** Threads about one record (e.g. on a requirement page), for staff or the owning organisation. */
export async function listThreadsForContext(actor: ThreadActor, contextType: MessageThreadContextType, contextId: string): Promise<ThreadListItem[]> {
  const result = await listThreads(actor, { contextType, contextId }, { page: 1, pageSize: 50, offset: 0 });
  return result.items;
}

