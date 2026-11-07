import "server-only";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { messages, messageThreadParticipants, messageThreads, organizationMembers, organizations, users } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import type { MessageThreadContextType, MessageThreadStatus } from "@/db/schema/operations";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import { grantFileAccess, requireUploadedFile } from "@/modules/files";
import { staffCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";
import { notify, notifyOrganization, notifyStaff } from "@/modules/notifications";

import type { NoteEntityType } from "./constants";
import { entityExists, organizationOwnsEntity } from "./entities";
import { enforceRateLimits, excerptText } from "./internal";
import { threadHrefFor } from "./links";
import type { ThreadCreateInput } from "./schemas";
import { ORG_THREAD_PERMISSION, THREAD_CONTEXT_STAFF_PERMISSION, threadAccess, type ThreadAccess, type ThreadViewer } from "./thread-access";

/**
 * Message threads between Venkat Sai staff and organisation members or candidates, optionally about a
 * requirement, partner assignment / submission, application, placement or organisation. Access rules live
 * in thread-access.ts; every function re-checks them for the acting capacity:
 *   { kind: "staff", ctx }  Command Centre (requireStaff)
 *   { kind: "org", ctx }    an organisation portal (requireOrgMember) — only that organisation's threads
 *   { kind: "user", user }  a candidate / individual participant (requireUser)
 */

export type ThreadActor = { kind: "staff"; ctx: StaffContext } | { kind: "org"; ctx: OrgContext } | { kind: "user"; user: SessionUser };
export type ThreadRow = typeof messageThreads.$inferSelect;

export function actorUser(actor: ThreadActor): SessionUser {
  return actor.kind === "user" ? actor.user : actor.ctx.user;
}

export function threadViewer(actor: ThreadActor): ThreadViewer {
  if (actor.kind === "staff") return { kind: "staff", userId: actor.ctx.user.id, permissions: actor.ctx.permissions };
  if (actor.kind === "org") {
    return {
      kind: "member",
      userId: actor.ctx.user.id,
      memberships: [{ organizationId: actor.ctx.organization.id, organizationType: actor.ctx.orgType, permissions: actor.ctx.permissions }],
    };
  }
  return { kind: "user", userId: actor.user.id };
}

const CONTEXT_ENTITY: Partial<Record<MessageThreadContextType, NoteEntityType>> = {
  requirement: "requirement",
  partner_assignment: "partner_assignment",
  partner_submission: "partner_submission",
  application: "application",
  placement: "placement",
  organization: "organization",
};

type ParticipantRow = typeof messageThreadParticipants.$inferSelect;

async function loadParticipant(tx: DbOrTx, threadId: string, userId: string): Promise<ParticipantRow | null> {
  const [row] = await tx
    .select()
    .from(messageThreadParticipants)
    .where(and(eq(messageThreadParticipants.threadId, threadId), eq(messageThreadParticipants.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Load a thread and the actor's access (throws "not found" when the actor may not read it). */
export async function loadThreadWithAccess(tx: DbOrTx, actor: ThreadActor, threadId: string, opts: { forUpdate?: boolean } = {}): Promise<{ thread: ThreadRow; access: ThreadAccess; participant: ParticipantRow | null }> {
  const query = tx.select().from(messageThreads).where(eq(messageThreads.id, threadId)).limit(1);
  const [thread] = opts.forUpdate ? await query.for("update") : await query;
  if (!thread) throw new ActionError("Conversation not found.");
  const user = actorUser(actor);
  const participant = await loadParticipant(tx, threadId, user.id);
  const access = threadAccess(threadViewer(actor), thread, participant);
  if (!access.canRead) throw new ActionError("Conversation not found.");
  return { thread, access, participant };
}

/** Capacity in which the actor participates (stored on their participant row). */
function participantOrganizationId(actor: ThreadActor, thread: ThreadRow): string | null {
  return actor.kind === "org" && thread.organizationId === actor.ctx.organization.id ? actor.ctx.organization.id : null;
}

async function touchParticipant(tx: DbOrTx, threadId: string, userId: string, organizationId: string | null, readAt: Date): Promise<void> {
  await tx
    .insert(messageThreadParticipants)
    .values({ threadId, userId, organizationId, lastReadAt: readAt })
    .onConflictDoUpdate({
      target: [messageThreadParticipants.threadId, messageThreadParticipants.userId],
      set: { lastReadAt: readAt, ...(organizationId ? { organizationId } : {}) },
    });
}

/** Validate attachments and share them with the thread's other parties. */
async function shareAttachments(tx: DbOrTx, actor: ThreadActor, thread: ThreadRow, fileIds: readonly string[]): Promise<string[]> {
  const unique = [...new Set(fileIds)];
  if (!unique.length) return [];
  const user = actorUser(actor);
  const files = [];
  for (const id of unique) {
    files.push(await requireUploadedFile(id, { purposes: ["message_attachment"], ownerUserId: user.id, ...(actor.kind === "org" ? { organizationId: actor.ctx.organization.id } : {}) }, tx));
  }
  const others = await tx
    .select({ userId: messageThreadParticipants.userId, organizationId: messageThreadParticipants.organizationId })
    .from(messageThreadParticipants)
    .where(and(eq(messageThreadParticipants.threadId, thread.id), isNull(messageThreadParticipants.removedAt), ne(messageThreadParticipants.userId, user.id)));
  for (const file of files) {
    if (thread.organizationId && file.organizationId !== thread.organizationId) {
      await grantFileAccess(
        { fileId: file.id, granteeOrganizationId: thread.organizationId, reason: "Shared in a conversation", contextType: "message_thread", contextId: thread.id, grantedByUserId: user.id },
        { tx },
      );
    }
    for (const p of others) {
      if (p.organizationId) continue;
      await grantFileAccess({ fileId: file.id, granteeUserId: p.userId, reason: "Shared in a conversation", contextType: "message_thread", contextId: thread.id, grantedByUserId: user.id }, { tx });
    }
  }
  return unique;
}

/**
 * Notify the other parties about a new message: active, unmuted participants (link per capacity); when no
 * member of the counterpart organisation has joined yet, its eligible members; when no staff member has
 * joined yet, staff holding the context permission.
 */
async function notifyNewMessage(tx: DbOrTx, actor: ThreadActor, thread: ThreadRow, body: string): Promise<void> {
  const author = actorUser(actor);
  const rows = await tx
    .select({ userId: messageThreadParticipants.userId, organizationId: messageThreadParticipants.organizationId, isMuted: messageThreadParticipants.isMuted, isStaff: users.isStaff, orgType: organizations.type })
    .from(messageThreadParticipants)
    .innerJoin(users, eq(users.id, messageThreadParticipants.userId))
    .leftJoin(organizations, eq(organizations.id, messageThreadParticipants.organizationId))
    .where(and(eq(messageThreadParticipants.threadId, thread.id), isNull(messageThreadParticipants.removedAt)));

  const data = { senderName: author.displayName, subject: thread.subject, excerpt: excerptText(body) };
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    if (r.userId === author.id || r.isMuted) continue;
    const href = r.organizationId && r.orgType ? threadHrefFor({ kind: "org", orgType: r.orgType }, thread.id) : r.isStaff ? threadHrefFor({ kind: "staff" }, thread.id) : threadHrefFor({ kind: "user" }, thread.id);
    groups.set(href, [...(groups.get(href) ?? []), r.userId]);
  }
  for (const [link, ids] of groups) {
    await notify({ event: "message.received", recipients: ids.map((userId) => ({ userId })), data, link, organizationId: thread.organizationId }, { tx });
  }

  if (actor.kind === "staff" && thread.organizationId && !rows.some((r) => r.organizationId === thread.organizationId)) {
    const [org] = await tx.select({ type: organizations.type }).from(organizations).where(eq(organizations.id, thread.organizationId)).limit(1);
    if (org) {
      await notifyOrganization(
        { event: "message.received", organizationId: thread.organizationId, permission: ORG_THREAD_PERMISSION[org.type] ?? undefined, data, link: threadHrefFor({ kind: "org", orgType: org.type }, thread.id) },
        { tx },
      );
    }
  }
  if (actor.kind !== "staff" && !rows.some((r) => r.isStaff && !r.organizationId)) {
    await notifyStaff(
      { event: "message.received", permission: THREAD_CONTEXT_STAFF_PERMISSION[thread.contextType], data, link: threadHrefFor({ kind: "staff" }, thread.id), channels: ["in_app"] },
      { tx },
    );
  }
}

async function validateContext(tx: DbOrTx, actor: ThreadActor, input: ThreadCreateInput): Promise<{ organizationId: string | null }> {
  const entity = CONTEXT_ENTITY[input.contextType];
  if (actor.kind === "org") {
    const orgId = actor.ctx.organization.id;
    if (input.organizationId && input.organizationId !== orgId) throw new ActionError("You can only start conversations for your own organisation.", { code: "forbidden" });
    if (entity && input.contextId && !(await organizationOwnsEntity(tx, entity, input.contextId, orgId))) throw new ActionError("The record this conversation is about could not be found.");
    return { organizationId: orgId };
  }
  // Staff
  if (entity && input.contextId && !(await entityExists(tx, entity, input.contextId))) throw new ActionError("The record this conversation is about could not be found.");
  let organizationId = input.contextType === "organization" ? (input.contextId ?? null) : (input.organizationId ?? null);
  if (organizationId) {
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt))).limit(1);
    if (!org) throw new ActionError("Organisation not found.", { fieldErrors: { organizationId: ["Choose an organisation"] } });
    if (entity && input.contextId && entity !== "organization" && !(await organizationOwnsEntity(tx, entity, input.contextId, organizationId))) {
      throw new ActionError("This organisation is not part of the selected record.", { fieldErrors: { organizationId: ["Not related to the record"] } });
    }
  } else {
    organizationId = null;
  }
  return { organizationId };
}

/**
 * Start a conversation. Staff need the context permission and pick the counterpart (an organisation and / or
 * individual participants, e.g. a candidate). Organisation members start conversations for their own
 * organisation about their own records (staff are reached by permission). Candidates use support tickets.
 */
export async function createThread(actor: ThreadActor, input: ThreadCreateInput): Promise<{ id: string }> {
  if (actor.kind === "user") throw new ActionError("Please contact us through a support request.", { code: "forbidden" });
  if (actor.kind === "staff" && !staffCan(actor.ctx, THREAD_CONTEXT_STAFF_PERMISSION[input.contextType])) {
    throw new ActionError("You do not have permission to start this kind of conversation.", { code: "forbidden" });
  }
  if (actor.kind === "org") {
    const needed = ORG_THREAD_PERMISSION[actor.ctx.orgType];
    if (needed && !actor.ctx.permissions.has(needed)) throw new ActionError("You do not have permission to send messages.", { code: "forbidden" });
    if (input.participantUserIds.length) throw new ActionError("Venkat Sai staff are added to the conversation automatically.");
  }
  const user = actorUser(actor);
  await enforceRateLimits([{ key: `thread-create:${user.id}`, limit: 20, windowSeconds: 60 * 60 }], "You are starting conversations too quickly. Please wait a little.");

  return db.transaction(async (tx) => {
    const { organizationId } = await validateContext(tx, actor, input);
    const participantIds = [...new Set(input.participantUserIds.filter((id) => id !== user.id))];
    if (actor.kind === "staff" && !organizationId && !participantIds.length) {
      throw new ActionError("Choose who the conversation is with: an organisation or at least one person.", { fieldErrors: { participantUserIds: ["Required"] } });
    }
    const participantRows = participantIds.length
      ? await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, participantIds), inArray(users.status, ["active", "pending_verification"])))
      : [];
    if (participantRows.length !== participantIds.length) throw new ActionError("One of the people could not be found.", { fieldErrors: { participantUserIds: ["Unknown person"] } });
    const memberIds = organizationId && participantIds.length
      ? new Set(
          (
            await tx
              .select({ userId: organizationMembers.userId })
              .from(organizationMembers)
              .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.status, "active"), inArray(organizationMembers.userId, participantIds)))
          ).map((r) => r.userId),
        )
      : new Set<string>();

    const now = new Date();
    const [thread] = await tx
      .insert(messageThreads)
      .values({ subject: input.subject, contextType: input.contextType, contextId: input.contextType === "general" ? null : (input.contextId ?? null), organizationId, createdByUserId: user.id, lastMessageAt: now })
      .returning();
    await tx.insert(messageThreadParticipants).values([
      { threadId: thread!.id, userId: user.id, organizationId: actor.kind === "org" ? organizationId : null, lastReadAt: now },
      ...participantIds.map((id) => ({ threadId: thread!.id, userId: id, organizationId: memberIds.has(id) ? organizationId : null })),
    ]);
    const attachmentFileIds = await shareAttachments(tx, actor, thread!, input.attachmentFileIds);
    await tx.insert(messages).values({ threadId: thread!.id, authorUserId: user.id, body: input.message, attachmentFileIds, createdAt: now });
    await audit({
      action: "thread.created",
      entityType: "message_thread",
      entityId: thread!.id,
      organizationId,
      metadata: { contextType: input.contextType, contextId: thread!.contextId, participants: participantIds.length },
      actorUserId: user.id,
      actorType: actor.kind === "staff" ? "staff" : "user",
      tx,
    });
    await notifyNewMessage(tx, actor, thread!, input.message);
    return { id: thread!.id };
  });
}

/** Post a message (rate limited); the author's read position moves to now and the other parties are notified. */
export async function postThreadMessage(actor: ThreadActor, threadId: string, input: { body: string; attachmentFileIds?: string[] }): Promise<{ id: string }> {
  const user = actorUser(actor);
  await enforceRateLimits([{ key: `thread-msg:${user.id}`, limit: 60, windowSeconds: 10 * 60 }], "You are sending messages too quickly. Please wait a moment.");
  return db.transaction(async (tx) => {
    const { thread, access } = await loadThreadWithAccess(tx, actor, threadId, { forUpdate: true });
    if (!access.canPost) throw new ActionError(thread.status === "closed" ? "This conversation is closed." : "You cannot post in this conversation.");
    const now = new Date();
    const attachmentFileIds = await shareAttachments(tx, actor, thread, input.attachmentFileIds ?? []);
    const [message] = await tx.insert(messages).values({ threadId, authorUserId: user.id, body: input.body, attachmentFileIds, createdAt: now }).returning({ id: messages.id });
    await tx.update(messageThreads).set({ lastMessageAt: now }).where(eq(messageThreads.id, threadId));
    await touchParticipant(tx, threadId, user.id, participantOrganizationId(actor, thread), now);
    await notifyNewMessage(tx, actor, thread, input.body);
    return { id: message!.id };
  });
}

/** Move the actor's read position to now (creates their participant row when they read via their organisation or role). */
export async function markThreadRead(actor: ThreadActor, threadId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { thread } = await loadThreadWithAccess(tx, actor, threadId);
    await touchParticipant(tx, threadId, actorUser(actor).id, participantOrganizationId(actor, thread), new Date());
  });
}

/** Mute / unmute notifications for the actor. */
export async function setThreadMuted(actor: ThreadActor, threadId: string, muted: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const { thread } = await loadThreadWithAccess(tx, actor, threadId);
    const user = actorUser(actor);
    await tx
      .insert(messageThreadParticipants)
      .values({ threadId, userId: user.id, organizationId: participantOrganizationId(actor, thread), isMuted: muted })
      .onConflictDoUpdate({ target: [messageThreadParticipants.threadId, messageThreadParticipants.userId], set: { isMuted: muted } });
  });
}

/** Close (staff or organisation members) or reopen (staff only) a conversation. */
export async function setThreadStatus(actor: ThreadActor, threadId: string, status: MessageThreadStatus): Promise<void> {
  if (actor.kind === "user") throw new ActionError("You cannot change this conversation.", { code: "forbidden" });
  if (status === "open" && actor.kind !== "staff") throw new ActionError("Only Venkat Sai staff can reopen a conversation.", { code: "forbidden" });
  await db.transaction(async (tx) => {
    const { thread } = await loadThreadWithAccess(tx, actor, threadId, { forUpdate: true });
    if (thread.status === status) return;
    await tx.update(messageThreads).set({ status, closedAt: status === "closed" ? new Date() : null }).where(eq(messageThreads.id, threadId));
    await audit({ action: "thread.status_changed", entityType: "message_thread", entityId: threadId, organizationId: thread.organizationId, metadata: { from: thread.status, to: status }, actorUserId: actor.ctx.user.id, actorType: actor.kind === "staff" ? "staff" : "user", tx });
  });
}

/** Staff add a person to a conversation (members of the thread's organisation join in that capacity). */
export async function addThreadParticipant(ctx: StaffContext, threadId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { thread } = await loadThreadWithAccess(tx, { kind: "staff", ctx }, threadId, { forUpdate: true });
    const [person] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), inArray(users.status, ["active", "pending_verification"]))).limit(1);
    if (!person) throw new ActionError("Person not found.", { fieldErrors: { userId: ["Unknown person"] } });
    let organizationId: string | null = null;
    if (thread.organizationId) {
      const [member] = await tx
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, thread.organizationId), eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
        .limit(1);
      if (member) organizationId = thread.organizationId;
    }
    await tx
      .insert(messageThreadParticipants)
      .values({ threadId, userId, organizationId })
      .onConflictDoUpdate({ target: [messageThreadParticipants.threadId, messageThreadParticipants.userId], set: { removedAt: null, organizationId } });
    await audit({ action: "thread.participant_added", entityType: "message_thread", entityId: threadId, organizationId: thread.organizationId, metadata: { userId }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Staff remove a person (history of who had access is kept via removedAt). */
export async function removeThreadParticipant(ctx: StaffContext, threadId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { thread } = await loadThreadWithAccess(tx, { kind: "staff", ctx }, threadId, { forUpdate: true });
    const updated = await tx
      .update(messageThreadParticipants)
      .set({ removedAt: new Date() })
      .where(and(eq(messageThreadParticipants.threadId, threadId), eq(messageThreadParticipants.userId, userId), isNull(messageThreadParticipants.removedAt)))
      .returning({ userId: messageThreadParticipants.userId });
    if (!updated.length) return;
    await audit({ action: "thread.participant_removed", entityType: "message_thread", entityId: threadId, organizationId: thread.organizationId, metadata: { userId }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Moderation: hide a message (shown as "message removed"). */
export async function hideThreadMessage(ctx: StaffContext, messageId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [message] = await tx.select({ id: messages.id, threadId: messages.threadId, deletedAt: messages.deletedAt }).from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!message) throw new ActionError("Message not found.");
    const { thread } = await loadThreadWithAccess(tx, { kind: "staff", ctx }, message.threadId);
    if (message.deletedAt) return;
    await tx.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, messageId));
    await audit({ action: "thread.message_hidden", entityType: "message_thread", entityId: thread.id, organizationId: thread.organizationId, metadata: { messageId }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Org types that have a messages area in their portal (used by UI to decide whether to show threads). */
export const ORG_TYPES_WITH_MESSAGES: readonly OrgType[] = ["employer", "recruitment_partner", "institution"];
