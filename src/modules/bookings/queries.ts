import "server-only";

import { and, asc, count, desc, eq, gte, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { bookingSlots, courses, slotBookings, users } from "@/db/schema";
import type { BookingSlotKind, SlotBookingSource, SlotBookingStatus } from "@/db/schema/bookings";
import { notDemoOrganizationRefSql } from "@/lib/demo-accounts";
import { maskPhone } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { logDataAccess } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { assertBookingsStaff, slotState, toPublicSlot, upcomingCondition, type SlotRow } from "./internal";
import { seatsLeft, venueNow } from "./rules";
import { SLOT_CODE_PATTERN, type PublicSlotView, type StaffSlotFilters } from "./schemas";

/**
 * Reads for the public /book pages and the Command Centre (/admin/bookings). Public reads expose only slot
 * details (PublicSlotView); staff reads need BOOKINGS_PERMISSION, phone numbers and emails additionally need
 * candidates.view_contact (each view is logged).
 */

/**
 * Courses the public may see, the same rule as the training catalogue: published, not deleted, and Venkat Sai's own
 * or from a verified (not lapsed) institution that is not a demo account.
 */
const publicCourseCondition = and(
  eq(courses.status, "published"),
  isNull(courses.deletedAt),
  sql`(${courses.organizationId} is null or exists (
    select 1 from organizations course_org
    where course_org.id = ${courses.organizationId}
      and course_org.status = 'verified'
      and course_org.deleted_at is null
      and (course_org.verification_expires_at is null or course_org.verification_expires_at > now())))`,
  notDemoOrganizationRefSql(courses.organizationId),
)!;
const publicCourseJoin = and(eq(courses.id, bookingSlots.courseId), publicCourseCondition);

const MAX_PUBLIC_SLOTS = 200;

/** Open slots that start after `now` (full ones included, shown as "Full"), soonest first. */
export async function listPublicSlots(filters: { kind?: BookingSlotKind; courseId?: string }, now: Date = new Date()): Promise<PublicSlotView[]> {
  const where: SQL[] = [eq(bookingSlots.status, "open"), upcomingCondition(now)];
  if (filters.kind) where.push(eq(bookingSlots.kind, filters.kind));
  if (filters.courseId) where.push(eq(bookingSlots.courseId, filters.courseId));
  const rows = await db
    .select({ slot: bookingSlots, courseTitle: courses.title, courseSlug: courses.slug })
    .from(bookingSlots)
    .leftJoin(courses, publicCourseJoin)
    .where(and(...where))
    .orderBy(asc(bookingSlots.date), asc(bookingSlots.startTime), asc(bookingSlots.code))
    .limit(MAX_PUBLIC_SLOTS);
  return rows.map((r) => toPublicSlot(r.slot, { title: r.courseTitle, slug: r.courseSlug }, now));
}

/** One slot by its public code (any status: the page explains closed, full, cancelled or past dates). */
export async function getPublicSlot(code: string, now: Date = new Date()): Promise<PublicSlotView | null> {
  const normalised = code.trim().toUpperCase();
  if (!SLOT_CODE_PATTERN.test(normalised)) return null;
  const [row] = await db
    .select({ slot: bookingSlots, courseTitle: courses.title, courseSlug: courses.slug })
    .from(bookingSlots)
    .leftJoin(courses, publicCourseJoin)
    .where(eq(bookingSlots.code, normalised))
    .limit(1);
  return row ? toPublicSlot(row.slot, { title: row.courseTitle, slug: row.courseSlug }, now) : null;
}

/** A published course by slug (for /book?course=<slug>). */
export async function findPublicCourse(slug: string): Promise<{ id: string; slug: string; title: string } | null> {
  const [row] = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title })
    .from(courses)
    .where(and(eq(courses.slug, slug), publicCourseCondition))
    .limit(1);
  return row ?? null;
}

/** Open training slots of a course with seats left (the course page shows "Book a training seat" when > 0). */
export async function countBookableSlotsForCourse(courseId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookingSlots)
    .where(and(eq(bookingSlots.courseId, courseId), eq(bookingSlots.status, "open"), upcomingCondition(now), sql`${bookingSlots.bookedSeats} < ${bookingSlots.capacity}`));
  return row?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Staff (Command Centre)
// ---------------------------------------------------------------------------

export type StaffSlotListItem = {
  id: string;
  code: string;
  kind: BookingSlotKind;
  title: string;
  trade: string;
  courseTitle: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  venue: string;
  capacity: number;
  bookedSeats: number;
  seatsLeft: number;
  status: SlotRow["status"];
  state: PublicSlotView["state"];
  /** Bookings that are not cancelled. */
  activeBookings: number;
};

const activeBookingsSql = sql<number>`(select count(*)::int from ${slotBookings} where ${slotBookings.slotId} = ${bookingSlots.id} and ${slotBookings.status} <> 'cancelled')`;

/** Upcoming (today on, soonest first) or past (most recent first) slots, every status. */
export async function listSlotsForStaff(ctx: StaffContext, filters: StaffSlotFilters, page: PageQuery, now: Date = new Date()): Promise<Paginated<StaffSlotListItem>> {
  assertBookingsStaff(ctx);
  const today = venueNow(now).date;
  const condition = filters.when === "past" ? lt(bookingSlots.date, today) : gte(bookingSlots.date, today);
  const order = filters.when === "past" ? [desc(bookingSlots.date), desc(bookingSlots.startTime)] : [asc(bookingSlots.date), asc(bookingSlots.startTime)];
  const [rows, totals] = await Promise.all([
    db
      .select({ slot: bookingSlots, courseTitle: courses.title, activeBookings: activeBookingsSql })
      .from(bookingSlots)
      .leftJoin(courses, eq(courses.id, bookingSlots.courseId))
      .where(condition)
      .orderBy(...order, asc(bookingSlots.code))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(bookingSlots).where(condition),
  ]);
  const items = rows.map(({ slot, courseTitle, activeBookings }): StaffSlotListItem => ({
    id: slot.id,
    code: slot.code,
    kind: slot.kind,
    title: slot.title,
    trade: slot.trade,
    courseTitle: courseTitle ?? null,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    venue: slot.venue,
    capacity: slot.capacity,
    bookedSeats: slot.bookedSeats,
    seatsLeft: seatsLeft(slot),
    status: slot.status,
    state: slotState(slot, now),
    activeBookings: Number(activeBookings ?? 0),
  }));
  return paginated(items, totals[0]?.value ?? 0, page);
}

/** Upcoming open slots and their free seats (list header). */
export async function upcomingSlotSummary(ctx: StaffContext, now: Date = new Date()): Promise<{ openSlots: number; freeSeats: number; bookedSeats: number }> {
  assertBookingsStaff(ctx);
  const [row] = await db
    .select({
      openSlots: count(),
      freeSeats: sql<number>`coalesce(sum(${bookingSlots.capacity} - ${bookingSlots.bookedSeats}), 0)::int`,
      bookedSeats: sql<number>`coalesce(sum(${bookingSlots.bookedSeats}), 0)::int`,
    })
    .from(bookingSlots)
    .where(and(eq(bookingSlots.status, "open"), upcomingCondition(now)));
  return { openSlots: row?.openSlots ?? 0, freeSeats: Number(row?.freeSeats ?? 0), bookedSeats: Number(row?.bookedSeats ?? 0) };
}

export type StaffBookingItem = {
  id: string;
  code: string;
  name: string;
  /** E.164 when the viewer may see contact details, else null (see `phoneMasked`). */
  phone: string | null;
  phoneMasked: string;
  email: string | null;
  trade: string;
  organizationName: string | null;
  seats: number;
  status: SlotBookingStatus;
  source: SlotBookingSource;
  notes: string | null;
  cancelledWithSlot: boolean;
  createdAt: Date;
  statusChangedAt: Date | null;
  statusChangedByName: string | null;
};

export type StaffSlotDetail = {
  slot: SlotRow;
  courseTitle: string | null;
  courseSlug: string | null;
  createdByName: string | null;
  cancelledByName: string | null;
  seatsLeft: number;
  state: PublicSlotView["state"];
  /** Every booking, oldest first (S.No order). */
  bookings: StaffBookingItem[];
  /** May the viewer see phone numbers and emails (candidates.view_contact)? */
  canContact: boolean;
};

const createdBy = alias(users, "slot_created_by");
const cancelledBy = alias(users, "slot_cancelled_by");

/**
 * One slot with its bookings for the staff pages, the attendance sheet and the Excel download. Phone numbers and
 * emails only with candidates.view_contact; showing them is logged (`log: false` when the caller logs, e.g. the
 * export, which records its own data-access entry).
 */
export async function getSlotForStaff(ctx: StaffContext, id: string, opts: { log?: boolean; reason?: string; now?: Date } = {}): Promise<StaffSlotDetail | null> {
  assertBookingsStaff(ctx);
  // A malformed id in the URL is "not found", not a database error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const now = opts.now ?? new Date();
  const [row] = await db
    .select({ slot: bookingSlots, courseTitle: courses.title, courseSlug: courses.slug, createdByName: createdBy.displayName, cancelledByName: cancelledBy.displayName })
    .from(bookingSlots)
    .leftJoin(courses, eq(courses.id, bookingSlots.courseId))
    .leftJoin(createdBy, eq(createdBy.id, bookingSlots.createdByUserId))
    .leftJoin(cancelledBy, eq(cancelledBy.id, bookingSlots.cancelledByUserId))
    .where(eq(bookingSlots.id, id))
    .limit(1);
  if (!row) return null;
  const canContact = staffCan(ctx, "candidates.view_contact");
  const bookings = await db
    .select({ b: slotBookings, changedBy: users.displayName })
    .from(slotBookings)
    .leftJoin(users, eq(users.id, slotBookings.statusChangedByUserId))
    .where(eq(slotBookings.slotId, id))
    .orderBy(asc(slotBookings.createdAt), asc(slotBookings.code));
  const items = bookings.map(({ b, changedBy }): StaffBookingItem => ({
    id: b.id,
    code: b.code,
    name: b.name,
    phone: canContact ? b.phone : null,
    phoneMasked: maskPhone(b.phone),
    email: canContact ? b.email : null,
    trade: b.trade,
    organizationName: b.organizationName,
    seats: b.seats,
    status: b.status,
    source: b.source,
    notes: b.notes,
    cancelledWithSlot: b.cancelledWithSlot,
    createdAt: b.createdAt,
    statusChangedAt: b.statusChangedAt,
    statusChangedByName: changedBy ?? null,
  }));
  if ((opts.log ?? true) && canContact && items.length) {
    await logDataAccess({
      actorUserId: ctx.user.id,
      subjectType: "booking_slot",
      subjectId: row.slot.id,
      dataCategory: "contact",
      accessType: "view",
      reason: opts.reason ?? "Bookings of a trade test / training slot (phone numbers shown to contact people)",
      metadata: { slotCode: row.slot.code, bookings: items.length },
    });
  }
  return {
    slot: row.slot,
    courseTitle: row.courseTitle ?? null,
    courseSlug: row.courseSlug ?? null,
    createdByName: row.createdByName ?? null,
    cancelledByName: row.cancelledByName ?? null,
    seatsLeft: seatsLeft(row.slot),
    state: slotState(row.slot, now),
    bookings: items,
    canContact,
  };
}

/** Venkat Sai's own courses for the slot form (published or not, never deleted); the current one is always kept. */
export async function listCourseOptions(ctx: StaffContext, currentCourseId?: string | null): Promise<{ value: string; label: string }[]> {
  assertBookingsStaff(ctx);
  const rows = await db
    .select({ id: courses.id, title: courses.title, status: courses.status })
    .from(courses)
    .where(and(isNull(courses.organizationId), isNull(courses.deletedAt), ne(courses.status, "archived")))
    .orderBy(asc(courses.title))
    .limit(300);
  const options = rows.map((c) => ({ value: c.id, label: c.status === "published" ? c.title : `${c.title} (not published)` }));
  if (currentCourseId && !options.some((o) => o.value === currentCourseId)) {
    const [current] = await db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.id, currentCourseId)).limit(1);
    if (current) options.unshift({ value: current.id, label: current.title });
  }
  return options;
}
