import "server-only";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { organizationMembers, organizations, supportTickets, ticketMessages, users } from "@/db/schema";
import type { Portal } from "@/db/schema/_constants";
import type { GrievanceType, SupportTicketCategory, SupportTicketChannel, SupportTicketPriority, SupportTicketStatus } from "@/db/schema/operations";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { logger } from "@/lib/logger";
import { audit, logSecurityEvent } from "@/modules/audit";
import { grantFileAccess, requireUploadedFile } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";
import { notify, notifyStaff, type NotificationRecipient } from "@/modules/notifications";

import {
  canTransition,
  GRIEVANCE_TYPE_LABELS,
  GUEST_TICKET_CATEGORIES,
  OPEN_TICKET_STATUSES,
  REQUESTER_PRIORITIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STAFF_TRANSITIONS,
  TICKET_STATUS_LABELS,
} from "./constants";
import { assertAssignableStaff, assertStaff, enforceRateLimits, excerptText, loadSlaSettings } from "./internal";
import { ORG_PORTAL_BY_TYPE, requesterTicketHref, staffTicketHref } from "./links";
import type { GuestTicketInput, StaffTicketInput, TicketCreateInput } from "./schemas";
import { computeTicketSla, escalationLevelFor, evaluateSla, type SlaSettings } from "./sla";

/**
 * Helpdesk: tickets from every portal and from guests, grievances (IT Rules 2021), SLA deadlines, requester /
 * staff conversation (internal notes never reach requesters), assignment, escalation and satisfaction.
 * Requester functions are scoped to the ticket's requesterUserId; staff functions need support.manage
 * (and support.grievances for grievance tickets).
 */

export type TicketRow = typeof supportTickets.$inferSelect;

export type TicketRequester =
  | { kind: "user"; user: SessionUser; portal: Portal; organizationId?: string | null }
  | { kind: "guest"; name: string; email: string; phone?: string | null; locale?: string | null; ipHash: string | null };

const HONEYPOT_RESULT = { id: null, code: null, grievanceCode: null } as const;

function hasAccount(ticket: Pick<TicketRow, "requesterUserId">): boolean {
  return Boolean(ticket.requesterUserId);
}

function requesterRecipient(ticket: Pick<TicketRow, "requesterUserId" | "requesterEmail" | "requesterName" | "locale">): NotificationRecipient | null {
  if (ticket.requesterUserId) return { userId: ticket.requesterUserId };
  if (ticket.requesterEmail) return { email: ticket.requesterEmail, name: ticket.requesterName ?? undefined, locale: ticket.locale ?? undefined };
  return null;
}

function canHandle(ctx: StaffContext, ticket: Pick<TicketRow, "isGrievance">): boolean {
  return staffCan(ctx, "support.manage") && (!ticket.isGrievance || staffCan(ctx, "support.grievances"));
}

function assertCanHandle(ctx: StaffContext, ticket: Pick<TicketRow, "isGrievance">): void {
  if (!canHandle(ctx, ticket)) throw new ActionError("You do not have permission to work on this support request.", { code: "forbidden" });
}

async function loadTicketForUpdate(tx: DbOrTx, id: string): Promise<TicketRow> {
  const [row] = await tx.select().from(supportTickets).where(eq(supportTickets.id, id)).for("update").limit(1);
  if (!row) throw new ActionError("Support request not found.");
  return row;
}

async function loadOwnTicketForUpdate(tx: DbOrTx, user: SessionUser, id: string): Promise<TicketRow> {
  const [row] = await tx
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, id), eq(supportTickets.requesterUserId, user.id)))
    .for("update")
    .limit(1);
  if (!row) throw new ActionError("Support request not found.");
  return row;
}

async function validateAttachments(fileIds: readonly string[], ownerUserId: string, tx: DbOrTx): Promise<string[]> {
  const unique = [...new Set(fileIds)];
  for (const id of unique) await requireUploadedFile(id, { purposes: ["ticket_attachment"], ownerUserId }, tx);
  return unique;
}

function staffPermissionFor(ticket: Pick<TicketRow, "isGrievance">) {
  return ticket.isGrievance ? ("support.grievances" as const) : ("support.view" as const);
}

/** Notify the assignee, or the support team when nobody is assigned. */
async function notifySupportTeam(
  ticket: TicketRow,
  input: { event: "support.ticket_created" | "support.ticket_reply"; data: Record<string, unknown>; dedupeKey?: string },
  tx: DbOrTx,
): Promise<void> {
  const data = { forStaff: true, code: ticket.code, subject: ticket.subject, grievanceCode: ticket.grievanceCode, ...input.data };
  if (ticket.assignedToUserId) {
    await notify({ event: input.event, recipients: [{ userId: ticket.assignedToUserId }], data, link: staffTicketHref(ticket.id), dedupeKey: input.dedupeKey }, { tx });
    return;
  }
  await notifyStaff(
    { event: input.event, permission: staffPermissionFor(ticket), data, link: staffTicketHref(ticket.id), channels: ticket.isGrievance ? ["in_app", "email"] : ["in_app"], dedupeKey: input.dedupeKey },
    { tx },
  );
}

// ---------------------------------------------------------------------------
// Creating tickets
// ---------------------------------------------------------------------------

export type InsertTicketInput = {
  requesterUserId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  organizationId?: string | null;
  portal: Portal;
  channel: SupportTicketChannel;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  subject: string;
  message: string;
  /** Who wrote the first message: the requester, or staff logging a call / visit. */
  firstMessageBy: { type: "requester"; userId: string | null; name: string | null } | { type: "staff"; userId: string; name: string };
  attachmentFileIds?: string[];
  locale?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  grievanceType?: GrievanceType | null;
  ipHash?: string | null;
  assignedToUserId?: string | null;
  createdAt?: Date;
};

/**
 * Insert a ticket + its first message with codes (TKT, GRV for grievances) and SLA deadlines. Runs in the
 * caller's transaction; sends nothing (callers notify). Grievances are at least high priority.
 */
export async function insertTicket(tx: DbOrTx, input: InsertTicketInput, sla: SlaSettings): Promise<TicketRow> {
  const isGrievance = input.category === "grievance" || Boolean(input.grievanceType);
  const grievanceType = isGrievance ? (input.grievanceType ?? "general") : null;
  const priority: SupportTicketPriority = isGrievance && (input.priority === "low" || input.priority === "normal") ? "high" : input.priority;
  const createdAt = input.createdAt ?? new Date();
  const code = await nextCode("TKT", { tx });
  const grievanceCode = isGrievance ? await nextCode("GRV", { tx }) : null;
  const deadlines = computeTicketSla({ createdAt, priority, isGrievance, grievanceType }, sla);

  const [ticket] = await tx
    .insert(supportTickets)
    .values({
      code,
      grievanceCode,
      requesterUserId: input.requesterUserId ?? null,
      requesterName: input.requesterName ?? null,
      requesterEmail: input.requesterEmail ?? null,
      requesterPhone: input.requesterPhone ?? null,
      organizationId: input.organizationId ?? null,
      portal: input.portal,
      channel: input.channel,
      category: input.category,
      priority,
      status: "open",
      statusChangedAt: createdAt,
      subject: input.subject,
      locale: input.locale ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      firstResponseDueAt: deadlines.firstResponseDueAt,
      resolutionDueAt: deadlines.resolutionDueAt,
      isGrievance,
      grievanceType,
      lastMessageAt: createdAt,
      ipHash: input.ipHash ?? null,
      createdAt,
    })
    .returning();

  await tx.insert(ticketMessages).values({
    ticketId: ticket!.id,
    authorUserId: input.firstMessageBy.userId,
    authorType: input.firstMessageBy.type,
    authorName: input.firstMessageBy.name,
    body: input.message,
    isInternal: false,
    attachmentFileIds: input.attachmentFileIds ?? [],
    createdAt,
  });
  return ticket!;
}

async function acknowledge(ticket: TicketRow, tx: DbOrTx): Promise<void> {
  const recipient = requesterRecipient(ticket);
  if (!recipient) return;
  await notify(
    {
      event: "support.ticket_created",
      recipients: [recipient],
      data: { code: ticket.code, subject: ticket.subject, grievanceCode: ticket.grievanceCode, firstResponseDue: ticket.firstResponseDueAt?.toISOString() ?? null },
      link: requesterTicketHref(ticket.portal, ticket.id, hasAccount(ticket)),
      organizationId: ticket.organizationId,
    },
    { tx },
  );
}

async function announceNewTicket(ticket: TicketRow, tx: DbOrTx): Promise<void> {
  await notifySupportTeam(
    ticket,
    {
      event: "support.ticket_created",
      data: {
        requesterName: ticket.requesterName,
        category: ticket.category,
        categoryLabel: TICKET_CATEGORY_LABELS[ticket.category],
        priority: ticket.priority,
        priorityLabel: TICKET_PRIORITY_LABELS[ticket.priority],
        firstResponseDue: ticket.firstResponseDueAt?.toISOString() ?? null,
      },
    },
    tx,
  );
}

/**
 * Raise a support request: signed-in users from any portal (attachments allowed, organisation membership
 * re-checked) or guests by email (honeypot, rate limits, no attachments). Returns the codes; a honeypot
 * hit returns nulls without storing anything.
 */
export async function createSupportTicket(
  requester: TicketRequester,
  input: TicketCreateInput | (GuestTicketInput & { attachmentFileIds?: never }),
): Promise<{ id: string | null; code: string | null; grievanceCode: string | null }> {
  const sla = await loadSlaSettings();

  if (requester.kind === "guest") {
    const guest = input as GuestTicketInput;
    if (guest.website?.trim()) {
      await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "support_ticket" } });
      return HONEYPOT_RESULT;
    }
    if (!GUEST_TICKET_CATEGORIES.includes(guest.category)) throw new ActionError("Choose a category.", { fieldErrors: { category: ["Choose a category"] } });
    await enforceRateLimits(
      [
        ...(requester.ipHash ? [{ key: `ticket:ip:${requester.ipHash}`, limit: 5, windowSeconds: 3600 }] : []),
        { key: `ticket:email:${requester.email}`, limit: 5, windowSeconds: 3600 },
      ],
      "You have sent several requests in a short time. Please wait a little and try again.",
    );
    const ticket = await db.transaction(async (tx) => {
      const row = await insertTicket(
        tx,
        {
          requesterName: requester.name,
          requesterEmail: requester.email,
          requesterPhone: requester.phone ?? null,
          portal: "public",
          channel: "web",
          category: guest.category,
          priority: "normal",
          subject: guest.subject,
          message: guest.message,
          firstMessageBy: { type: "requester", userId: null, name: requester.name },
          locale: requester.locale ?? null,
          grievanceType: guest.grievanceType ?? null,
          ipHash: requester.ipHash,
        },
        sla,
      );
      await audit({ action: "ticket.created", entityType: "support_ticket", entityId: row.id, metadata: { code: row.code, category: row.category, guest: true, grievance: row.isGrievance }, tx });
      await acknowledge(row, tx);
      await announceNewTicket(row, tx);
      return row;
    });
    return { id: ticket.id, code: ticket.code, grievanceCode: ticket.grievanceCode };
  }

  const data = input as TicketCreateInput;
  const user = requester.user;
  await enforceRateLimits([{ key: `ticket:user:${user.id}`, limit: 10, windowSeconds: 3600 }], "You have raised several requests in a short time. Please wait a little and try again.");
  if (!REQUESTER_PRIORITIES.includes(data.priority)) throw new ActionError("Choose a priority.");

  const ticket = await db.transaction(async (tx) => {
    let organizationId: string | null = null;
    if (requester.organizationId) {
      const [membership] = await tx
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
        .where(and(eq(organizationMembers.organizationId, requester.organizationId), eq(organizationMembers.userId, user.id), eq(organizationMembers.status, "active"), isNull(organizations.deletedAt)))
        .limit(1);
      if (!membership) throw new ActionError("You are not a member of this organisation.", { code: "forbidden" });
      organizationId = membership.organizationId;
    }
    const attachmentFileIds = await validateAttachments(data.attachmentFileIds ?? [], user.id, tx);
    const row = await insertTicket(
      tx,
      {
        requesterUserId: user.id,
        requesterName: user.displayName,
        requesterEmail: user.email,
        requesterPhone: user.phone,
        organizationId,
        portal: requester.portal,
        channel: "web",
        category: data.category,
        priority: data.priority,
        subject: data.subject,
        message: data.message,
        firstMessageBy: { type: "requester", userId: user.id, name: user.displayName },
        attachmentFileIds,
        locale: user.locale,
        relatedType: data.relatedType && data.relatedId ? data.relatedType : null,
        relatedId: data.relatedType && data.relatedId ? data.relatedId : null,
        grievanceType: data.grievanceType ?? null,
      },
      sla,
    );
    await audit({
      action: "ticket.created",
      entityType: "support_ticket",
      entityId: row.id,
      organizationId,
      metadata: { code: row.code, category: row.category, portal: row.portal, grievance: row.isGrievance, attachments: attachmentFileIds.length },
      actorUserId: user.id,
      actorType: "user",
      tx,
    });
    await acknowledge(row, tx);
    await announceNewTicket(row, tx);
    return row;
  });
  return { id: ticket.id, code: ticket.code, grievanceCode: ticket.grievanceCode };
}

/** Staff log a request received by phone, email, WhatsApp or in person (optionally for an existing account). */
export async function createTicketForRequester(ctx: StaffContext, input: StaffTicketInput): Promise<{ id: string; code: string; grievanceCode: string | null }> {
  assertStaff(ctx, "support.manage");
  if ((input.category === "grievance" || input.grievanceType) && !staffCan(ctx, "support.grievances")) {
    throw new ActionError("Only grievance officers can log grievances.", { code: "forbidden" });
  }
  const sla = await loadSlaSettings();
  const ticket = await db.transaction(async (tx) => {
    let requester: { id: string | null; name: string | null; email: string | null; phone: string | null; locale: string | null } = {
      id: null,
      name: input.requesterName ?? null,
      email: input.requesterEmail ?? null,
      phone: input.requesterPhone ?? null,
      locale: null,
    };
    if (input.requesterUserId) {
      const [u] = await tx
        .select({ id: users.id, displayName: users.displayName, email: users.email, phone: users.phone, locale: users.locale })
        .from(users)
        .where(eq(users.id, input.requesterUserId))
        .limit(1);
      if (!u) throw new ActionError("Account not found.", { fieldErrors: { requesterUserId: ["Choose an account"] } });
      requester = { id: u.id, name: u.displayName, email: u.email, phone: u.phone, locale: u.locale };
    }
    // The requester's own portal (where their link points): the organisation's portal, else the People Portal.
    let portal: Portal = requester.id ? "talent" : "public";
    if (input.organizationId) {
      const [org] = await tx
        .select({ id: organizations.id, type: organizations.type })
        .from(organizations)
        .where(and(eq(organizations.id, input.organizationId), isNull(organizations.deletedAt)))
        .limit(1);
      if (!org) throw new ActionError("Organisation not found.", { fieldErrors: { organizationId: ["Choose an organisation"] } });
      portal = ORG_PORTAL_BY_TYPE[org.type];
    }
    const row = await insertTicket(
      tx,
      {
        requesterUserId: requester.id,
        requesterName: requester.name,
        requesterEmail: requester.email,
        requesterPhone: requester.phone,
        organizationId: input.organizationId ?? null,
        portal,
        channel: input.channel,
        category: input.category,
        priority: input.priority,
        subject: input.subject,
        message: input.message,
        firstMessageBy: { type: "staff", userId: ctx.user.id, name: ctx.user.displayName },
        locale: requester.locale,
        grievanceType: input.grievanceType ?? null,
        assignedToUserId: input.assignToSelf ? ctx.user.id : null,
      },
      sla,
    );
    await audit({ action: "ticket.created", entityType: "support_ticket", entityId: row.id, organizationId: row.organizationId, metadata: { code: row.code, channel: row.channel, loggedByStaff: true }, actorUserId: ctx.user.id, actorType: "staff", tx });
    await acknowledge(row, tx);
    if (!input.assignToSelf) await announceNewTicket(row, tx);
    return row;
  });
  return { id: ticket.id, code: ticket.code, grievanceCode: ticket.grievanceCode };
}

// ---------------------------------------------------------------------------
// Requester actions
// ---------------------------------------------------------------------------

/** The requester adds to their own ticket; a resolved ticket reopens, a closed one cannot be replied to. */
export async function replyToOwnTicket(user: SessionUser, ticketId: string, input: { body: string; attachmentFileIds?: string[] }): Promise<{ messageId: string }> {
  await enforceRateLimits([{ key: `ticket-reply:${user.id}`, limit: 30, windowSeconds: 600 }], "You are sending messages too quickly. Please wait a moment.");
  return db.transaction(async (tx) => {
    const ticket = await loadOwnTicketForUpdate(tx, user, ticketId);
    if (ticket.status === "closed") throw new ActionError("This request is closed. Please open a new request if you still need help.");
    const attachmentFileIds = await validateAttachments(input.attachmentFileIds ?? [], user.id, tx);
    const now = new Date();
    const [message] = await tx
      .insert(ticketMessages)
      .values({ ticketId, authorUserId: user.id, authorType: "requester", authorName: user.displayName, body: input.body, attachmentFileIds })
      .returning({ id: ticketMessages.id });
    const reopened = ticket.status === "resolved";
    await tx
      .update(supportTickets)
      .set({
        status: "pending_staff",
        ...(ticket.status !== "pending_staff" ? { statusChangedAt: now } : {}),
        ...(reopened ? { resolvedAt: null } : {}),
        lastMessageAt: now,
      })
      .where(eq(supportTickets.id, ticketId));
    await audit({ action: "ticket.replied", entityType: "support_ticket", entityId: ticketId, organizationId: ticket.organizationId, metadata: { by: "requester", reopened, attachments: attachmentFileIds.length }, actorUserId: user.id, actorType: "user", tx });
    await notifySupportTeam(ticket, { event: "support.ticket_reply", data: { authorName: user.displayName, excerpt: excerptText(input.body) } }, tx);
    return { messageId: message!.id };
  });
}

/** The requester closes their own ticket. */
export async function closeOwnTicket(user: SessionUser, ticketId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const ticket = await loadOwnTicketForUpdate(tx, user, ticketId);
    if (ticket.status === "closed") return;
    const now = new Date();
    await tx.update(supportTickets).set({ status: "closed", closedAt: now, statusChangedAt: now }).where(eq(supportTickets.id, ticketId));
    await audit({ action: "ticket.status_changed", entityType: "support_ticket", entityId: ticketId, metadata: { from: ticket.status, to: "closed", by: "requester" }, actorUserId: user.id, actorType: "user", tx });
  });
}

/** Satisfaction rating (1–5) once the request is resolved or closed; can be updated. */
export async function rateOwnTicket(user: SessionUser, ticketId: string, input: { rating: number; comment?: string | null }): Promise<void> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ActionError("Choose a rating from 1 to 5.");
  await db.transaction(async (tx) => {
    const ticket = await loadOwnTicketForUpdate(tx, user, ticketId);
    if (ticket.status !== "resolved" && ticket.status !== "closed") throw new ActionError("You can rate a request once it has been resolved.");
    await tx
      .update(supportTickets)
      .set({ satisfactionRating: input.rating, satisfactionComment: input.comment?.trim() || null })
      .where(eq(supportTickets.id, ticketId));
    await audit({ action: "ticket.rated", entityType: "support_ticket", entityId: ticketId, metadata: { rating: input.rating }, actorUserId: user.id, actorType: "user", tx });
  });
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

/**
 * Staff reply (visible to the requester) or internal note (`internal: true`, never shown to requesters).
 * Public replies stamp the first response, move the ticket to "awaiting your reply" (or `status`), share
 * attachments with the requester's account and notify the requester.
 */
export async function replyToTicket(
  ctx: StaffContext,
  ticketId: string,
  input: { body: string; attachmentFileIds?: string[]; internal?: boolean; status?: SupportTicketStatus },
): Promise<{ messageId: string }> {
  assertStaff(ctx, "support.manage");
  return db.transaction(async (tx) => {
    const ticket = await loadTicketForUpdate(tx, ticketId);
    assertCanHandle(ctx, ticket);
    const internal = input.internal === true;
    const attachmentFileIds = await validateAttachments(input.attachmentFileIds ?? [], ctx.user.id, tx);
    if (!internal && attachmentFileIds.length && !ticket.requesterUserId) {
      throw new ActionError("Guests without an account cannot open attachments. Describe the information in your reply instead.", { fieldErrors: { attachmentFileIds: ["Not available for guest requests"] } });
    }
    const now = new Date();
    const [message] = await tx
      .insert(ticketMessages)
      .values({ ticketId, authorUserId: ctx.user.id, authorType: "staff", authorName: ctx.user.displayName, body: input.body, isInternal: internal, attachmentFileIds })
      .returning({ id: ticketMessages.id });

    if (internal) {
      if (input.status && input.status !== ticket.status) await applyStatusChange(ctx, ticket, input.status, { resolution: null }, tx);
      await audit({ action: "ticket.internal_note_added", entityType: "support_ticket", entityId: ticketId, metadata: { attachments: attachmentFileIds.length }, actorUserId: ctx.user.id, actorType: "staff", tx });
      return { messageId: message!.id };
    }

    if (ticket.requesterUserId) {
      for (const fileId of attachmentFileIds) {
        await grantFileAccess(
          { fileId, granteeUserId: ticket.requesterUserId, reason: "Support request reply", contextType: "support_ticket", contextId: ticketId, grantedByUserId: ctx.user.id },
          { tx },
        );
      }
    }
    const nextStatus = input.status ?? "pending_requester";
    await tx
      .update(supportTickets)
      .set({ firstRespondedAt: ticket.firstRespondedAt ?? now, lastMessageAt: now, ...(ticket.assignedToUserId ? {} : { assignedToUserId: ctx.user.id }) })
      .where(eq(supportTickets.id, ticketId));
    if (nextStatus !== ticket.status) {
      await applyStatusChange(ctx, { ...ticket, firstRespondedAt: ticket.firstRespondedAt ?? now }, nextStatus, { resolution: nextStatus === "resolved" ? input.body : null, silent: true }, tx);
    }
    await audit({ action: "ticket.replied", entityType: "support_ticket", entityId: ticketId, organizationId: ticket.organizationId, metadata: { by: "staff", status: nextStatus, attachments: attachmentFileIds.length }, actorUserId: ctx.user.id, actorType: "staff", tx });
    const recipient = requesterRecipient(ticket);
    if (recipient) {
      await notify(
        {
          event: nextStatus === "resolved" ? "support.ticket_resolved" : "support.ticket_reply",
          recipients: [recipient],
          data: { code: ticket.code, subject: ticket.subject, excerpt: excerptText(input.body, 600), resolution: nextStatus === "resolved" ? excerptText(input.body, 600) : null, isGuest: !ticket.requesterUserId },
          link: requesterTicketHref(ticket.portal, ticketId, hasAccount(ticket)),
          organizationId: ticket.organizationId,
        },
        { tx },
      );
    }
    return { messageId: message!.id };
  });
}

async function applyStatusChange(
  ctx: StaffContext,
  ticket: TicketRow,
  status: SupportTicketStatus,
  opts: { resolution: string | null; silent?: boolean },
  tx: DbOrTx,
): Promise<void> {
  if (!canTransition(TICKET_STAFF_TRANSITIONS, ticket.status, status)) {
    throw new ActionError(`A request cannot move from ${TICKET_STATUS_LABELS[ticket.status]} to ${TICKET_STATUS_LABELS[status]}.`);
  }
  const now = new Date();
  const resolution = opts.resolution?.trim() || ticket.resolution;
  if (status === "resolved" && !resolution) {
    throw new ActionError("Summarise the resolution for the requester.", { fieldErrors: { resolution: ["A resolution summary is required"] } });
  }
  const reopening = (ticket.status === "resolved" || ticket.status === "closed") && OPEN_TICKET_STATUSES.includes(status);
  await tx
    .update(supportTickets)
    .set({
      status,
      statusChangedAt: now,
      ...(status === "resolved" ? { resolvedAt: now, resolution } : {}),
      ...(status === "closed" ? { closedAt: now, resolvedAt: ticket.resolvedAt ?? now } : {}),
      ...(reopening ? { resolvedAt: null, closedAt: null } : {}),
    })
    .where(eq(supportTickets.id, ticket.id));
  await audit({ action: "ticket.status_changed", entityType: "support_ticket", entityId: ticket.id, organizationId: ticket.organizationId, metadata: { from: ticket.status, to: status }, actorUserId: ctx.user.id, actorType: "staff", tx });
  if (status === "resolved" && !opts.silent) {
    const recipient = requesterRecipient(ticket);
    if (recipient) {
      await notify(
        {
          event: "support.ticket_resolved",
          recipients: [recipient],
          data: { code: ticket.code, subject: ticket.subject, resolution: excerptText(resolution ?? "", 600), isGuest: !ticket.requesterUserId },
          link: requesterTicketHref(ticket.portal, ticket.id, hasAccount(ticket)),
          organizationId: ticket.organizationId,
        },
        { tx },
      );
    }
  }
}

/** Change status (TICKET_STAFF_TRANSITIONS). Resolving needs a resolution summary and notifies the requester. */
export async function changeTicketStatus(ctx: StaffContext, ticketId: string, status: SupportTicketStatus, opts: { resolution?: string | null } = {}): Promise<void> {
  assertStaff(ctx, "support.manage");
  await db.transaction(async (tx) => {
    const ticket = await loadTicketForUpdate(tx, ticketId);
    assertCanHandle(ctx, ticket);
    await applyStatusChange(ctx, ticket, status, { resolution: opts.resolution ?? null }, tx);
  });
}

/** Assign to a staff member who can handle it (support.manage; support.grievances for grievances). */
export async function assignTicket(ctx: StaffContext, ticketId: string, assigneeUserId: string | null): Promise<void> {
  assertStaff(ctx, "support.manage");
  await db.transaction(async (tx) => {
    const ticket = await loadTicketForUpdate(tx, ticketId);
    assertCanHandle(ctx, ticket);
    const assignee = assigneeUserId ? await assertAssignableStaff(assigneeUserId, ticket.isGrievance ? "support.grievances" : "support.manage", tx) : null;
    if (ticket.assignedToUserId === (assignee?.id ?? null)) return;
    await tx.update(supportTickets).set({ assignedToUserId: assignee?.id ?? null }).where(eq(supportTickets.id, ticketId));
    await tx.insert(ticketMessages).values({
      ticketId,
      authorUserId: ctx.user.id,
      authorType: "system",
      authorName: ctx.user.displayName,
      body: assignee ? `Assigned to ${assignee.displayName} by ${ctx.user.displayName}.` : `Unassigned by ${ctx.user.displayName}.`,
      isInternal: true,
    });
    await audit({ action: "ticket.assigned", entityType: "support_ticket", entityId: ticketId, metadata: { from: ticket.assignedToUserId, to: assignee?.id ?? null }, actorUserId: ctx.user.id, actorType: "staff", tx });
    if (assignee && assignee.id !== ctx.user.id) {
      await notify(
        {
          event: "work.assigned",
          recipients: [{ userId: assignee.id }],
          data: { kindLabel: ticket.isGrievance ? "grievance" : "support request", title: ticket.subject, code: ticket.grievanceCode ?? ticket.code, assignedBy: ctx.user.displayName, priority: ticket.priority, dueAt: ticket.firstRespondedAt ? ticket.resolutionDueAt?.toISOString() : ticket.firstResponseDueAt?.toISOString() },
          link: staffTicketHref(ticketId),
        },
        { tx },
      );
    }
  });
}

/** Change priority; recalculates the first-response deadline while no response has been sent. */
export async function setTicketPriority(ctx: StaffContext, ticketId: string, priority: SupportTicketPriority): Promise<void> {
  assertStaff(ctx, "support.manage");
  const sla = await loadSlaSettings();
  await db.transaction(async (tx) => {
    const ticket = await loadTicketForUpdate(tx, ticketId);
    assertCanHandle(ctx, ticket);
    if (ticket.priority === priority) return;
    const deadlines = computeTicketSla({ createdAt: ticket.createdAt, priority, isGrievance: ticket.isGrievance, grievanceType: ticket.grievanceType }, sla);
    await tx
      .update(supportTickets)
      .set({ priority, ...(ticket.firstRespondedAt ? {} : { firstResponseDueAt: deadlines.firstResponseDueAt }) })
      .where(eq(supportTickets.id, ticketId));
    await audit({ action: "ticket.priority_changed", entityType: "support_ticket", entityId: ticketId, metadata: { from: ticket.priority, to: priority }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Escalate one level (optionally to a new assignee) with a reason kept as an internal note. */
export async function escalateTicket(ctx: StaffContext, ticketId: string, input: { note: string; assigneeUserId?: string | null }): Promise<void> {
  assertStaff(ctx, "support.manage");
  await db.transaction(async (tx) => {
    const ticket = await loadTicketForUpdate(tx, ticketId);
    assertCanHandle(ctx, ticket);
    const assignee = input.assigneeUserId ? await assertAssignableStaff(input.assigneeUserId, ticket.isGrievance ? "support.grievances" : "support.manage", tx) : null;
    const level = ticket.escalationLevel + 1;
    await tx
      .update(supportTickets)
      .set({ escalationLevel: level, escalatedAt: new Date(), ...(assignee ? { assignedToUserId: assignee.id } : {}) })
      .where(eq(supportTickets.id, ticketId));
    await tx.insert(ticketMessages).values({
      ticketId,
      authorUserId: ctx.user.id,
      authorType: "system",
      authorName: ctx.user.displayName,
      body: `Escalated to level ${level}${assignee ? ` and assigned to ${assignee.displayName}` : ""}: ${input.note}`,
      isInternal: true,
    });
    await audit({ action: "ticket.escalated", entityType: "support_ticket", entityId: ticketId, metadata: { level, assigneeUserId: assignee?.id ?? null, note: input.note }, actorUserId: ctx.user.id, actorType: "staff", tx });
    if (assignee && assignee.id !== ctx.user.id) {
      await notify(
        {
          event: "work.assigned",
          recipients: [{ userId: assignee.id }],
          data: { kindLabel: "escalated support request", title: ticket.subject, code: ticket.grievanceCode ?? ticket.code, assignedBy: ctx.user.displayName, priority: ticket.priority },
          link: staffTicketHref(ticketId),
        },
        { tx },
      );
    }
  });
}

/** Register a ticket as a formal grievance (support.grievances): GRV code, at least high priority, statutory SLA. */
export async function markTicketAsGrievance(ctx: StaffContext, ticketId: string, grievanceType: GrievanceType): Promise<{ grievanceCode: string }> {
  assertStaff(ctx, ["support.manage", "support.grievances"]);
  const sla = await loadSlaSettings();
  return db.transaction(async (tx) => {
    const ticket = await loadTicketForUpdate(tx, ticketId);
    const grievanceCode = ticket.grievanceCode ?? (await nextCode("GRV", { tx }));
    const priority: SupportTicketPriority = ticket.priority === "low" || ticket.priority === "normal" ? "high" : ticket.priority;
    const deadlines = computeTicketSla({ createdAt: ticket.createdAt, priority, isGrievance: true, grievanceType }, sla);
    await tx
      .update(supportTickets)
      .set({
        isGrievance: true,
        grievanceType,
        grievanceCode,
        priority,
        resolutionDueAt: deadlines.resolutionDueAt,
        ...(ticket.firstRespondedAt ? {} : { firstResponseDueAt: deadlines.firstResponseDueAt }),
      })
      .where(eq(supportTickets.id, ticketId));
    await tx.insert(ticketMessages).values({
      ticketId,
      authorUserId: ctx.user.id,
      authorType: "system",
      authorName: ctx.user.displayName,
      body: `Registered as grievance ${grievanceCode} (${GRIEVANCE_TYPE_LABELS[grievanceType]}).`,
      isInternal: true,
    });
    await audit({ action: "ticket.marked_grievance", entityType: "support_ticket", entityId: ticketId, metadata: { grievanceCode, grievanceType }, actorUserId: ctx.user.id, actorType: "staff", tx });
    return { grievanceCode };
  });
}

/** Replace the staff tags of a ticket (lower-case, unique). */
export async function setTicketTags(ctx: StaffContext, ticketId: string, tags: readonly string[]): Promise<void> {
  assertStaff(ctx, "support.manage");
  const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  await db.transaction(async (tx) => {
    const ticket = await loadTicketForUpdate(tx, ticketId);
    assertCanHandle(ctx, ticket);
    await tx.update(supportTickets).set({ tags: clean }).where(eq(supportTickets.id, ticketId));
  });
}

// ---------------------------------------------------------------------------
// SLA watch (background task "support.sla_watch")
// ---------------------------------------------------------------------------

export type SlaWatchSummary = { checked: number; breached: number; dueSoon: number; escalated: number };

const WARN_BEFORE_MS = 2 * 60 * 60 * 1000;

/**
 * Flag tickets that missed a deadline (slaBreachedAt, once), escalate grievances (level 1 for a missed
 * acknowledgement, 2 for a missed resolution, priority urgent) and notify: the assignee (or the support
 * team when unassigned) for deadlines that are close or missed, and grievance officers for grievances.
 * Notifications carry dedupe keys, so hourly runs never repeat themselves.
 */
export async function runSlaWatch(now: Date = new Date()): Promise<SlaWatchSummary> {
  const horizon = new Date(now.getTime() + WARN_BEFORE_MS);
  const candidates = await db
    .select()
    .from(supportTickets)
    .where(
      and(
        inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]),
        or(
          and(isNull(supportTickets.firstRespondedAt), lte(supportTickets.firstResponseDueAt, horizon)),
          and(isNull(supportTickets.resolvedAt), lte(supportTickets.resolutionDueAt, horizon)),
        ),
      ),
    )
    // Tickets not flagged yet come first, so long-breached tickets can never starve new ones.
    .orderBy(sql`${supportTickets.slaBreachedAt} is not null`, supportTickets.firstResponseDueAt)
    .limit(500);

  const summary: SlaWatchSummary = { checked: candidates.length, breached: 0, dueSoon: 0, escalated: 0 };
  for (const candidate of candidates) {
    try {
      await db.transaction(async (tx) => {
        const ticket = await loadTicketForUpdate(tx, candidate.id);
        if (!OPEN_TICKET_STATUSES.includes(ticket.status)) return;
        const snapshot = evaluateSla(ticket, now, WARN_BEFORE_MS);
        const missedFirst = snapshot.firstResponse === "breached";
        const missedResolution = snapshot.resolution === "breached";

        if ((missedFirst || missedResolution) && !ticket.slaBreachedAt) {
          await tx.update(supportTickets).set({ slaBreachedAt: now }).where(eq(supportTickets.id, ticket.id));
          await audit({ action: "ticket.sla_breached", entityType: "support_ticket", entityId: ticket.id, metadata: { firstResponse: snapshot.firstResponse, resolution: snapshot.resolution }, actorType: "system", tx });
          summary.breached += 1;
        }

        let level = ticket.escalationLevel;
        if (ticket.isGrievance) {
          level = escalationLevelFor(ticket.escalationLevel, { firstResponse: missedFirst, resolution: missedResolution });
          if (level > ticket.escalationLevel) {
            await tx.update(supportTickets).set({ escalationLevel: level, escalatedAt: now, priority: "urgent" }).where(eq(supportTickets.id, ticket.id));
            await tx.insert(ticketMessages).values({
              ticketId: ticket.id,
              authorType: "system",
              authorName: "SLA watch",
              body: `Escalated automatically to level ${level}: the ${missedResolution ? "resolution" : "acknowledgement"} deadline was missed.`,
              isInternal: true,
            });
            await audit({ action: "ticket.escalated", entityType: "support_ticket", entityId: ticket.id, metadata: { level, automatic: true }, actorType: "system", tx });
            summary.escalated += 1;
          }
        }

        const deadlines = [
          { key: "first_response", label: "first response", state: snapshot.firstResponse, dueAt: ticket.firstResponseDueAt },
          { key: "resolution", label: "resolution", state: snapshot.resolution, dueAt: ticket.resolutionDueAt },
        ] as const;
        for (const d of deadlines) {
          if (d.state !== "breached" && d.state !== "due_soon") continue;
          if (d.state === "due_soon") summary.dueSoon += 1;
          const breached = d.state === "breached";
          const data = {
            code: ticket.code,
            subject: ticket.subject,
            grievanceCode: ticket.grievanceCode,
            breached,
            deadlineLabel: d.label,
            dueAt: d.dueAt?.toISOString() ?? null,
            escalationLevel: level || null,
          };
          const dedupeKey = `sla:${ticket.id}:${d.key}:${d.state}`;
          if (ticket.assignedToUserId) {
            await notify({ event: "support.sla_breached", recipients: [{ userId: ticket.assignedToUserId }], data, link: staffTicketHref(ticket.id), dedupeKey }, { tx });
          } else {
            await notifyStaff({ event: "support.sla_breached", permission: staffPermissionFor(ticket), data, link: staffTicketHref(ticket.id), channels: ["in_app"], dedupeKey }, { tx });
          }
          if (ticket.isGrievance && breached) {
            await notifyStaff({ event: "support.sla_breached", permission: "support.grievances", data, link: staffTicketHref(ticket.id), dedupeKey: `${dedupeKey}:officers` }, { tx });
          }
        }
      });
    } catch (error) {
      logger.error("SLA watch failed for a ticket", { ticketId: candidate.id, error });
    }
  }
  return summary;
}

/** Count of open tickets by SLA state for dashboards (no personal data). */
export async function countOpenTicketsPastDue(now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(
      and(
        inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]),
        or(and(isNull(supportTickets.firstRespondedAt), lte(supportTickets.firstResponseDueAt, now)), and(isNull(supportTickets.resolvedAt), lte(supportTickets.resolutionDueAt, now))),
      ),
    );
  return rows[0]?.value ?? 0;
}
