import "server-only";

import { and, count, desc, eq, ilike, isNull, ne, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { enquiries, leads, supportTickets, users } from "@/db/schema";
import type { EnquiryStatus, EnquiryType } from "@/db/schema/operations";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import type { EnquiryRow } from "./enquiries";
import { assertStaff, likePattern } from "./internal";

export type EnquiryListFilters = {
  status?: EnquiryStatus | "open";
  type?: EnquiryType;
  /** "me", "unassigned" or a staff user id. */
  assignedTo?: string;
  q?: string;
};

export type EnquiryListItem = Pick<EnquiryRow, "id" | "code" | "type" | "status" | "name" | "email" | "phone" | "organizationName" | "subject" | "createdAt" | "respondedAt" | "assignedToUserId" | "leadId" | "supportTicketId"> & {
  assigneeName: string | null;
};

export type EnquiryDetail = {
  enquiry: Omit<EnquiryRow, "ipHash">;
  assigneeName: string | null;
  lead: { id: string; code: string; status: string; name: string } | null;
  ticket: { id: string; code: string; status: string; grievanceCode: string | null } | null;
};

/** Grievance enquiries are only visible to grievance officers (support.grievances). */
function visibilityCondition(ctx: StaffContext): SQL | undefined {
  return staffCan(ctx, "support.grievances") ? undefined : ne(enquiries.type, "grievance");
}

export async function listEnquiries(ctx: StaffContext, filters: EnquiryListFilters, page: PageQuery): Promise<Paginated<EnquiryListItem>> {
  assertStaff(ctx, "leads.view");
  const where: SQL[] = [];
  const visible = visibilityCondition(ctx);
  if (visible) where.push(visible);
  if (filters.status === "open") where.push(or(eq(enquiries.status, "new"), eq(enquiries.status, "in_progress"))!);
  else if (filters.status) where.push(eq(enquiries.status, filters.status));
  if (filters.type) where.push(eq(enquiries.type, filters.type));
  if (filters.assignedTo === "me") where.push(eq(enquiries.assignedToUserId, ctx.user.id));
  else if (filters.assignedTo === "unassigned") where.push(isNull(enquiries.assignedToUserId));
  else if (filters.assignedTo) where.push(eq(enquiries.assignedToUserId, filters.assignedTo));
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const pattern = likePattern(q);
    where.push(or(ilike(enquiries.code, pattern), ilike(enquiries.name, pattern), ilike(enquiries.organizationName, pattern), ilike(enquiries.subject, pattern), eq(enquiries.email, q.toLowerCase()))!);
  }
  const condition = where.length ? and(...where) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: enquiries.id,
        code: enquiries.code,
        type: enquiries.type,
        status: enquiries.status,
        name: enquiries.name,
        email: enquiries.email,
        phone: enquiries.phone,
        organizationName: enquiries.organizationName,
        subject: enquiries.subject,
        createdAt: enquiries.createdAt,
        respondedAt: enquiries.respondedAt,
        assignedToUserId: enquiries.assignedToUserId,
        leadId: enquiries.leadId,
        supportTicketId: enquiries.supportTicketId,
        assigneeName: users.displayName,
      })
      .from(enquiries)
      .leftJoin(users, eq(users.id, enquiries.assignedToUserId))
      .where(condition)
      .orderBy(desc(enquiries.createdAt), desc(enquiries.id))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(enquiries).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({ ...r, assigneeName: r.assigneeName ?? null })),
    totals[0]?.value ?? 0,
    page,
  );
}

export async function getEnquiry(ctx: StaffContext, id: string): Promise<EnquiryDetail | null> {
  assertStaff(ctx, "leads.view");
  const visible = visibilityCondition(ctx);
  const [row] = await db
    .select({ enquiry: enquiries, assigneeName: users.displayName })
    .from(enquiries)
    .leftJoin(users, eq(users.id, enquiries.assignedToUserId))
    .where(visible ? and(eq(enquiries.id, id), visible) : eq(enquiries.id, id))
    .limit(1);
  if (!row) return null;
  const [lead, ticket] = await Promise.all([
    row.enquiry.leadId
      ? db.select({ id: leads.id, code: leads.code, status: leads.status, name: leads.name }).from(leads).where(eq(leads.id, row.enquiry.leadId)).limit(1)
      : Promise.resolve([]),
    row.enquiry.supportTicketId
      ? db
          .select({ id: supportTickets.id, code: supportTickets.code, status: supportTickets.status, grievanceCode: supportTickets.grievanceCode })
          .from(supportTickets)
          .where(eq(supportTickets.id, row.enquiry.supportTicketId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  // The IP hash is for abuse handling only; it is never shown.
  const { ipHash: _ipHash, ...enquiry } = row.enquiry;
  void _ipHash;
  return { enquiry, assigneeName: row.assigneeName ?? null, lead: lead[0] ?? null, ticket: ticket[0] ?? null };
}

export async function enquiryCounts(ctx: StaffContext): Promise<Record<EnquiryStatus, number>> {
  assertStaff(ctx, "leads.view");
  const visible = visibilityCondition(ctx);
  const rows = await db.select({ status: enquiries.status, value: count() }).from(enquiries).where(visible).groupBy(enquiries.status);
  const counts: Record<EnquiryStatus, number> = { new: 0, in_progress: 0, responded: 0, closed: 0, spam: 0 };
  for (const r of rows) counts[r.status] = r.value;
  return counts;
}
