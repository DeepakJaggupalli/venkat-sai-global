import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { enquiries, organizations, supportTickets, ticketMessages, users } from "@/db/schema";
import type { Portal } from "@/db/schema/_constants";
import type { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus, TicketMessageAuthorType } from "@/db/schema/operations";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { getFiles, toFileSummary, type FileSummary } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";

import { OPEN_TICKET_STATUSES } from "./constants";
import { assertStaff, likePattern } from "./internal";
import { evaluateSla, type SlaSnapshot } from "./sla";
import type { TicketRow } from "./support";

/**
 * Helpdesk reads. Requester reads are scoped to requesterUserId and NEVER include internal notes, tags,
 * assignee identity, IP hash or escalation data; staff reads need support.view (grievances need
 * support.grievances).
 */

export type TicketListFilters = {
  status?: SupportTicketStatus | "open" | "closed";
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  /** "me", "unassigned" or a staff user id. */
  assignedTo?: string;
  grievance?: boolean;
  /** Missed a deadline (slaBreachedAt set or past due now). */
  breached?: boolean;
  portal?: Portal;
  organizationId?: string;
  q?: string;
};

export type StaffTicketListItem = Pick<
  TicketRow,
  | "id"
  | "code"
  | "grievanceCode"
  | "subject"
  | "category"
  | "priority"
  | "status"
  | "portal"
  | "channel"
  | "requesterName"
  | "organizationId"
  | "assignedToUserId"
  | "isGrievance"
  | "escalationLevel"
  | "firstResponseDueAt"
  | "firstRespondedAt"
  | "resolutionDueAt"
  | "slaBreachedAt"
  | "lastMessageAt"
  | "createdAt"
> & { assigneeName: string | null; sla: SlaSnapshot };

export type TicketMessageView = {
  id: string;
  authorType: TicketMessageAuthorType;
  /** Display label: the requester's name, "Venkat Sai support" for staff (requester view), or the staff name (staff view). */
  authorLabel: string;
  isOwn: boolean;
  isInternal: boolean;
  body: string;
  attachments: FileSummary[];
  createdAt: Date;
};

export type RequesterTicketView = Pick<
  TicketRow,
  | "id"
  | "code"
  | "grievanceCode"
  | "subject"
  | "category"
  | "priority"
  | "status"
  | "portal"
  | "organizationId"
  | "isGrievance"
  | "grievanceType"
  | "firstResponseDueAt"
  | "resolutionDueAt"
  | "resolution"
  | "resolvedAt"
  | "closedAt"
  | "satisfactionRating"
  | "satisfactionComment"
  | "createdAt"
  | "lastMessageAt"
> & { messages: TicketMessageView[]; canReply: boolean; canRate: boolean };

export type StaffTicketDetail = {
  ticket: Omit<TicketRow, "searchVector" | "ipHash">;
  sla: SlaSnapshot;
  messages: TicketMessageView[];
  requester: { id: string; displayName: string; email: string | null; phone: string | null; status: string } | null;
  organization: { id: string; name: string; type: string } | null;
  assigneeName: string | null;
  enquiry: { id: string; code: string } | null;
};

async function attachmentMap(messages: { attachmentFileIds: string[] }[]): Promise<Map<string, FileSummary>> {
  const ids = [...new Set(messages.flatMap((m) => m.attachmentFileIds))];
  if (!ids.length) return new Map();
  const files = await getFiles(ids);
  return new Map(files.map((f) => [f.id, toFileSummary(f)]));
}

// ---------------------------------------------------------------------------
// Requester (own tickets)
// ---------------------------------------------------------------------------

export type RequesterTicketListItem = Pick<TicketRow, "id" | "code" | "grievanceCode" | "subject" | "category" | "status" | "priority" | "createdAt" | "lastMessageAt" | "organizationId">;

/** The signed-in user's own tickets (optionally those raised for one organisation). */
export async function listMyTickets(
  user: SessionUser,
  filters: { status?: "open" | "closed"; organizationId?: string },
  page: PageQuery,
): Promise<Paginated<RequesterTicketListItem>> {
  const where: SQL[] = [eq(supportTickets.requesterUserId, user.id)];
  if (filters.status === "open") where.push(inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]));
  else if (filters.status === "closed") where.push(inArray(supportTickets.status, ["resolved", "closed"]));
  if (filters.organizationId) where.push(eq(supportTickets.organizationId, filters.organizationId));
  const condition = and(...where);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: supportTickets.id,
        code: supportTickets.code,
        grievanceCode: supportTickets.grievanceCode,
        subject: supportTickets.subject,
        category: supportTickets.category,
        status: supportTickets.status,
        priority: supportTickets.priority,
        createdAt: supportTickets.createdAt,
        lastMessageAt: supportTickets.lastMessageAt,
        organizationId: supportTickets.organizationId,
      })
      .from(supportTickets)
      .where(condition)
      .orderBy(desc(sql`coalesce(${supportTickets.lastMessageAt}, ${supportTickets.createdAt})`))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(supportTickets).where(condition),
  ]);
  return paginated(rows, totals[0]?.value ?? 0, page);
}

/** One of the user's own tickets with the public conversation only (internal notes are never selected). */
export async function getMyTicket(user: SessionUser, ticketId: string): Promise<RequesterTicketView | null> {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.requesterUserId, user.id)))
    .limit(1);
  if (!ticket) return null;
  const rows = await db
    .select({
      id: ticketMessages.id,
      authorType: ticketMessages.authorType,
      authorUserId: ticketMessages.authorUserId,
      authorName: ticketMessages.authorName,
      body: ticketMessages.body,
      attachmentFileIds: ticketMessages.attachmentFileIds,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.isInternal, false)))
    .orderBy(asc(ticketMessages.createdAt));
  const files = await attachmentMap(rows);
  const messages: TicketMessageView[] = rows.map((m) => ({
    id: m.id,
    authorType: m.authorType,
    authorLabel: m.authorType === "requester" ? (m.authorName ?? "You") : m.authorType === "staff" ? "Venkat Sai support" : "Update",
    isOwn: m.authorUserId === user.id,
    isInternal: false,
    body: m.body,
    attachments: m.attachmentFileIds.map((id) => files.get(id)).filter((f): f is FileSummary => Boolean(f)),
    createdAt: m.createdAt,
  }));
  return {
    id: ticket.id,
    code: ticket.code,
    grievanceCode: ticket.grievanceCode,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    portal: ticket.portal,
    organizationId: ticket.organizationId,
    isGrievance: ticket.isGrievance,
    grievanceType: ticket.grievanceType,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    resolution: ticket.resolution,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    satisfactionRating: ticket.satisfactionRating,
    satisfactionComment: ticket.satisfactionComment,
    createdAt: ticket.createdAt,
    lastMessageAt: ticket.lastMessageAt,
    messages,
    canReply: ticket.status !== "closed",
    canRate: ticket.status === "resolved" || ticket.status === "closed",
  };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

function grievanceVisibility(ctx: StaffContext): SQL | undefined {
  return staffCan(ctx, "support.grievances") ? undefined : eq(supportTickets.isGrievance, false);
}

export async function listTickets(ctx: StaffContext, filters: TicketListFilters, page: PageQuery): Promise<Paginated<StaffTicketListItem>> {
  assertStaff(ctx, "support.view");
  const now = new Date();
  const where: SQL[] = [];
  const visible = grievanceVisibility(ctx);
  if (visible) where.push(visible);
  if (filters.status === "open") where.push(inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]));
  else if (filters.status === "closed") where.push(inArray(supportTickets.status, ["resolved", "closed"]));
  else if (filters.status) where.push(eq(supportTickets.status, filters.status));
  if (filters.priority) where.push(eq(supportTickets.priority, filters.priority));
  if (filters.category) where.push(eq(supportTickets.category, filters.category));
  if (filters.portal) where.push(eq(supportTickets.portal, filters.portal));
  if (filters.organizationId) where.push(eq(supportTickets.organizationId, filters.organizationId));
  if (filters.grievance !== undefined) where.push(eq(supportTickets.isGrievance, filters.grievance));
  if (filters.assignedTo === "me") where.push(eq(supportTickets.assignedToUserId, ctx.user.id));
  else if (filters.assignedTo === "unassigned") where.push(isNull(supportTickets.assignedToUserId));
  else if (filters.assignedTo) where.push(eq(supportTickets.assignedToUserId, filters.assignedTo));
  if (filters.breached) {
    where.push(
      or(
        isNotNull(supportTickets.slaBreachedAt),
        and(inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]), isNull(supportTickets.firstRespondedAt), lte(supportTickets.firstResponseDueAt, now)),
        and(inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]), isNull(supportTickets.resolvedAt), lte(supportTickets.resolutionDueAt, now)),
      )!,
    );
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.push(
      sql`(${supportTickets.searchVector} @@ websearch_to_tsquery('simple', ${q}) or ${supportTickets.code} ilike ${likePattern(q)} or ${supportTickets.grievanceCode} ilike ${likePattern(q)} or ${supportTickets.requesterEmail} = ${q.toLowerCase()})`,
    );
  }
  const condition = where.length ? and(...where) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({ ticket: supportTickets, assigneeName: users.displayName })
      .from(supportTickets)
      .leftJoin(users, eq(users.id, supportTickets.assignedToUserId))
      .where(condition)
      .orderBy(
        sql`case ${supportTickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
        sql`coalesce(${supportTickets.firstResponseDueAt}, ${supportTickets.createdAt}) asc`,
      )
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(supportTickets).where(condition),
  ]);
  return paginated(
    rows.map(({ ticket: t, assigneeName }) => ({
      id: t.id,
      code: t.code,
      grievanceCode: t.grievanceCode,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      portal: t.portal,
      channel: t.channel,
      requesterName: t.requesterName,
      organizationId: t.organizationId,
      assignedToUserId: t.assignedToUserId,
      isGrievance: t.isGrievance,
      escalationLevel: t.escalationLevel,
      firstResponseDueAt: t.firstResponseDueAt,
      firstRespondedAt: t.firstRespondedAt,
      resolutionDueAt: t.resolutionDueAt,
      slaBreachedAt: t.slaBreachedAt,
      lastMessageAt: t.lastMessageAt,
      createdAt: t.createdAt,
      assigneeName: assigneeName ?? null,
      sla: evaluateSla(t, now),
    })),
    totals[0]?.value ?? 0,
    page,
  );
}

/** Full ticket for staff, internal notes included. */
export async function getTicket(ctx: StaffContext, ticketId: string): Promise<StaffTicketDetail | null> {
  assertStaff(ctx, "support.view");
  const visible = grievanceVisibility(ctx);
  const assignee = alias(users, "assignee");
  const [row] = await db
    .select({ ticket: supportTickets, assigneeName: assignee.displayName })
    .from(supportTickets)
    .leftJoin(assignee, eq(assignee.id, supportTickets.assignedToUserId))
    .where(visible ? and(eq(supportTickets.id, ticketId), visible) : eq(supportTickets.id, ticketId))
    .limit(1);
  if (!row) return null;
  const t = row.ticket;
  const [messageRows, requester, org, enquiry] = await Promise.all([
    db
      .select({
        id: ticketMessages.id,
        authorType: ticketMessages.authorType,
        authorUserId: ticketMessages.authorUserId,
        authorName: ticketMessages.authorName,
        body: ticketMessages.body,
        isInternal: ticketMessages.isInternal,
        attachmentFileIds: ticketMessages.attachmentFileIds,
        createdAt: ticketMessages.createdAt,
      })
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(asc(ticketMessages.createdAt)),
    t.requesterUserId
      ? db.select({ id: users.id, displayName: users.displayName, email: users.email, phone: users.phone, status: users.status }).from(users).where(eq(users.id, t.requesterUserId)).limit(1)
      : Promise.resolve([]),
    t.organizationId ? db.select({ id: organizations.id, name: organizations.name, type: organizations.type }).from(organizations).where(eq(organizations.id, t.organizationId)).limit(1) : Promise.resolve([]),
    db.select({ id: enquiries.id, code: enquiries.code }).from(enquiries).where(eq(enquiries.supportTicketId, ticketId)).limit(1),
  ]);
  const files = await attachmentMap(messageRows);
  const { searchVector: _sv, ipHash: _ip, ...ticket } = t;
  void [_sv, _ip];
  return {
    ticket,
    sla: evaluateSla(t),
    messages: messageRows.map((m) => ({
      id: m.id,
      authorType: m.authorType,
      authorLabel: m.authorName ?? (m.authorType === "requester" ? "Requester" : m.authorType === "staff" ? "Staff" : "System"),
      isOwn: m.authorUserId === ctx.user.id,
      isInternal: m.isInternal,
      body: m.body,
      attachments: m.attachmentFileIds.map((id) => files.get(id)).filter((f): f is FileSummary => Boolean(f)),
      createdAt: m.createdAt,
    })),
    requester: requester[0] ?? null,
    organization: org[0] ?? null,
    assigneeName: row.assigneeName ?? null,
    enquiry: enquiry[0] ?? null,
  };
}

/** Queue counters for the support desk header. */
export async function ticketQueueCounts(ctx: StaffContext): Promise<{ open: number; unassigned: number; mine: number; breached: number; grievances: number }> {
  assertStaff(ctx, "support.view");
  const visible = grievanceVisibility(ctx);
  const open = inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]);
  const base = visible ? and(open, visible) : open;
  const [row] = await db
    .select({
      open: count(),
      unassigned: sql<number>`count(*) filter (where ${supportTickets.assignedToUserId} is null)::int`,
      mine: sql<number>`count(*) filter (where ${supportTickets.assignedToUserId} = ${ctx.user.id})::int`,
      breached: sql<number>`count(*) filter (where ${supportTickets.slaBreachedAt} is not null)::int`,
      grievances: sql<number>`count(*) filter (where ${supportTickets.isGrievance})::int`,
    })
    .from(supportTickets)
    .where(base);
  return { open: row?.open ?? 0, unassigned: row?.unassigned ?? 0, mine: row?.mine ?? 0, breached: row?.breached ?? 0, grievances: row?.grievances ?? 0 };
}
