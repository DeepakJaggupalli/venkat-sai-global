import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import { CONTACT } from "@/config/contact";
import { db, type DbOrTx } from "@/db";
import { bookingSlots, courses, slotBookings } from "@/db/schema";
import type { SlotBookingStatus } from "@/db/schema/bookings";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { audit, logSecurityEvent } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { notifyStaff } from "@/modules/notifications";
import { notifyBusinessInbox } from "@/modules/operations/business-inbox";
import { getSetting } from "@/modules/settings";

import { assertBookingsStaff, enforceRateLimits, isActivePhoneConflict, slotState, toPublicSlot, upcomingCondition, type SlotRow } from "./internal";
import { getPublicSlot } from "./queries";
import { formatSlotDate, formatTimeRange, sameName, seatsLeft, venueNow } from "./rules";
import {
  BOOKING_KIND_LABELS,
  BOOKINGS_ADMIN_PATH,
  BOOKINGS_PERMISSION,
  MAX_SEATS_PER_BOOKING,
  type BookingRequestInput,
  type BookingResult,
  type BookingSlotInput,
  type PublicSlotView,
  type StaffBookingInput,
} from "./schemas";

/**
 * Trade test and training seat bookings.
 *
 * Seats are taken in one atomic statement inside the booking transaction:
 *   UPDATE booking_slots SET booked_seats = booked_seats + n
 *    WHERE id = … AND status = 'open' AND booked_seats + n <= capacity AND <slot still upcoming> RETURNING …
 * so two people can never take the last seat (the second update finds no row and gets "full"). Cancelling a
 * booking gives its seats back; a partial unique index keeps one active booking per phone number per slot (a
 * repeated request gets the existing booking back).
 *
 * Authorisation: public booking needs consent and passes rate limits; staff functions need BOOKINGS_PERMISSION
 * (recruitment.assessments). Every change is audited.
 */

const CLOSED_MESSAGE = "This date is no longer open for booking. Please choose another date.";
const FULL_MESSAGE = "Sorry, this date is now full. Please choose another date.";

/**
 * Website seats one network (ip hash) may hold on one date, across all the mobile numbers typed from it: one
 * organisation booking, or that many people. Stops one person filling a date with made-up numbers; staff can still
 * add more (walk-ins, WhatsApp bookings) from the Command Centre.
 */
export const WEBSITE_SEATS_PER_NETWORK = MAX_SEATS_PER_BOOKING;

type FieldErrors = Record<string, string[]>;

function invalid(fieldErrors: FieldErrors, message = "Please check the highlighted fields."): never {
  throw new ActionError(message, { fieldErrors });
}

function slotHref(slotId: string): string {
  return `${BOOKINGS_ADMIN_PATH}/${slotId}`;
}

/** Explain why seats could not be taken (the slot row as it is now). */
function seatsUnavailable(slot: SlotRow | undefined, now: Date): never {
  if (!slot || slot.status !== "open" || slotState(slot, now) === "past") throw new ActionError(CLOSED_MESSAGE, { code: "slot_closed" });
  const left = seatsLeft(slot);
  if (left <= 0) throw new ActionError(FULL_MESSAGE, { code: "slot_full" });
  const message = `Only ${left} ${left === 1 ? "seat is" : "seats are"} left on this date. Book ${left} or fewer, or choose another date.`;
  throw new ActionError(message, { code: "slot_full", fieldErrors: { seats: [message] } });
}

async function activeBookingFor(slotId: string, phone: string, tx: DbOrTx) {
  const [row] = await tx
    .select()
    .from(slotBookings)
    .where(and(eq(slotBookings.slotId, slotId), eq(slotBookings.phone, phone), ne(slotBookings.status, "cancelled")))
    .limit(1);
  return row ?? null;
}

/**
 * The booking this mobile number already holds on the slot, as the public form returns it. Its code, seats and
 * company go back only when the name typed matches the name booked (the same person booking twice): someone who
 * only knows the number learns that it is booked, never the booking code, the name or the company behind it.
 */
function existingBookingResult(existing: typeof slotBookings.$inferSelect, input: BookingRequestInput, slot: PublicSlotView): BookingResult {
  if (!sameName(input.name, existing.name)) {
    return { code: null, existing: true, name: input.name, seats: input.seats, organizationName: input.organizationName, slot };
  }
  return { code: existing.code, existing: true, name: input.name, seats: existing.seats, organizationName: existing.organizationName, slot };
}

// ---------------------------------------------------------------------------
// Public booking (/book)
// ---------------------------------------------------------------------------

/**
 * Book seats on an open slot from the public form. Honeypot hits get a confirmation without a code (security
 * event only). Rate limited per network and per phone. When the phone number already holds a booking on this
 * slot, nothing changes and `existing: true` comes back (with that booking's code only when the same name was typed,
 * see existingBookingResult). Staff with BOOKINGS_PERMISSION get an in-app alert (no phone number); the business
 * inbox gets an email copy with the number.
 */
export async function bookSlot(input: BookingRequestInput, meta: { ipHash: string | null; userId?: string | null }, now: Date = new Date()): Promise<BookingResult> {
  const preview = await getPublicSlot(input.slotCode, now);
  if (!preview) throw new ActionError(CLOSED_MESSAGE, { code: "slot_closed" });
  // The course shown with the slot (published courses only), reused for the views built below.
  const course = { title: preview.courseTitle, slug: preview.courseSlug };
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "book_slot" } });
    return { code: null, existing: false, name: input.name, seats: input.seats, organizationName: input.organizationName, slot: preview };
  }
  if (!input.consentToContact) invalid({ consentToContact: ["Please agree that we may call or WhatsApp you about this booking"] });

  await enforceRateLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `book:ip:${meta.ipHash}`, limit: 10, windowSeconds: 10 * 60 },
            { key: `book:ip-day:${meta.ipHash}`, limit: 30, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      { key: `book:phone:${input.phone}`, limit: 5, windowSeconds: 60 * 60 },
    ],
    "You have made several bookings in a short time. Please wait a little, or book on WhatsApp.",
  );

  const policyVersion = await getSetting("privacy.policy_version").catch(() => null);

  const existingResult = async (): Promise<BookingResult | null> => {
    const [slot] = await db.select().from(bookingSlots).where(eq(bookingSlots.code, input.slotCode)).limit(1);
    if (!slot) return null;
    const existing = await activeBookingFor(slot.id, input.phone, db);
    if (!existing) return null;
    const view = await getPublicSlot(slot.code, now);
    return existingBookingResult(existing, input, view ?? preview);
  };

  try {
    return await db.transaction(async (tx) => {
      const [slot] = await tx.select().from(bookingSlots).where(eq(bookingSlots.code, input.slotCode)).limit(1);
      if (!slot) throw new ActionError(CLOSED_MESSAGE, { code: "slot_closed" });

      const existing = await activeBookingFor(slot.id, input.phone, tx);
      if (existing) return existingBookingResult(existing, input, toPublicSlot(slot, course, now));

      const [taken] = await tx
        .update(bookingSlots)
        .set({ bookedSeats: sql`${bookingSlots.bookedSeats} + ${input.seats}` })
        .where(and(eq(bookingSlots.id, slot.id), eq(bookingSlots.status, "open"), sql`${bookingSlots.bookedSeats} + ${input.seats} <= ${bookingSlots.capacity}`, upcomingCondition(now)))
        .returning();
      if (!taken) {
        const [current] = await tx.select().from(bookingSlots).where(eq(bookingSlots.id, slot.id)).limit(1);
        // A parallel request from the same number (a double tap, or a retry after a lost answer) may have just taken
        // the last seat: that is this person's booking, not a full date.
        const justBooked = await activeBookingFor(slot.id, input.phone, tx);
        if (justBooked) return existingBookingResult(justBooked, input, toPublicSlot(current ?? slot, course, now));
        seatsUnavailable(current, now);
      }

      // Checked after taking the seats: the slot row stays locked until this transaction ends, so two requests from
      // the same network cannot both pass, and throwing here gives the seats back.
      if (meta.ipHash) {
        const [held] = await tx
          .select({ seats: sql<number>`coalesce(sum(${slotBookings.seats}), 0)::int` })
          .from(slotBookings)
          .where(and(eq(slotBookings.slotId, slot.id), eq(slotBookings.ipHash, meta.ipHash), eq(slotBookings.source, "website"), ne(slotBookings.status, "cancelled")));
        const left = Math.max(0, WEBSITE_SEATS_PER_NETWORK - Number(held?.seats ?? 0));
        if (input.seats > left) {
          const message = left
            ? `Only ${left} more ${left === 1 ? "seat" : "seats"} can be booked online for this date from your phone or internet connection. Book ${left} or fewer, or WhatsApp or call us.`
            : "We cannot take more online bookings for this date from your phone or internet connection. Please WhatsApp or call us to book.";
          throw new ActionError(message, { code: "network_limit", fieldErrors: { seats: [message] } });
        }
      }

      const code = await nextCode("BKG", { tx });
      const [booking] = await tx
        .insert(slotBookings)
        .values({
          code,
          slotId: slot.id,
          name: input.name,
          phone: input.phone,
          email: input.email,
          trade: input.trade,
          organizationName: input.organizationName,
          seats: input.seats,
          consentToContact: true,
          privacyNoticeVersion: typeof policyVersion === "string" ? policyVersion : null,
          source: "website",
          userId: meta.userId ?? null,
          ipHash: meta.ipHash,
        })
        .returning({ id: slotBookings.id });

      await audit({
        action: "slot_booking.created",
        entityType: "slot_booking",
        entityId: booking!.id,
        metadata: { code, slotId: slot.id, slotCode: slot.code, seats: input.seats, organisationBooking: Boolean(input.organizationName), source: "website" },
        tx,
      });

      const left = seatsLeft(taken!);
      const data = {
        code,
        name: input.name,
        organizationName: input.organizationName,
        slotTitle: slot.title,
        slotCode: slot.code,
        kind: BOOKING_KIND_LABELS[slot.kind],
        date: formatSlotDate(slot.date),
        time: formatTimeRange(slot.startTime, slot.endTime),
        trade: input.trade,
        seats: input.seats,
        seatsLeft: left,
      };
      // In-app alert without the phone number (privacy by default); the business inbox copy includes it so the
      // owner can call straight from the email.
      await notifyStaff({ event: "booking.received", permission: BOOKINGS_PERMISSION, data: { ...data, forStaff: true }, link: slotHref(slot.id), channels: ["in_app"] }, { tx });
      await notifyBusinessInbox({ event: "booking.received", data: { ...data, phone: input.phone }, link: slotHref(slot.id) }, tx);

      return { code, existing: false, name: input.name, seats: input.seats, organizationName: input.organizationName, slot: toPublicSlot(taken!, course, now) };
    });
  } catch (error) {
    // The same phone number booked this slot at the same moment: hand back that booking.
    if (isActivePhoneConflict(error)) {
      const result = await existingResult();
      if (result) return result;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Staff: bookings
// ---------------------------------------------------------------------------

async function lockSlot(id: string, tx: DbOrTx): Promise<SlotRow> {
  const [slot] = await tx.select().from(bookingSlots).where(eq(bookingSlots.id, id)).for("update").limit(1);
  if (!slot) throw new ActionError("This slot could not be found.", { code: "not_found" });
  return slot;
}

/**
 * Staff add a booking for someone who phoned or walked in (also on a closed slot, never on a cancelled or past
 * date). Seats are taken the same atomic way; no staff alert (staff made it). A phone number that already holds a
 * booking on the slot is refused with that booking's code.
 */
export async function createStaffBooking(ctx: StaffContext, input: StaffBookingInput, now: Date = new Date()): Promise<{ id: string; code: string; slotId: string }> {
  assertBookingsStaff(ctx);
  try {
    return await db.transaction(async (tx) => {
      const slot = await lockSlot(input.slotId, tx);
      if (slot.status === "cancelled") throw new ActionError("This slot was cancelled. Create a new slot for a new date.");
      if (slot.date < venueNow(now).date) throw new ActionError("This date has passed. Bookings can only be added for today or later.");
      const existing = await activeBookingFor(slot.id, input.phone, tx);
      if (existing) invalid({ phone: [`This mobile number already has booking ${existing.code} on this date.`] }, `This mobile number already has booking ${existing.code} on this date.`);

      const [taken] = await tx
        .update(bookingSlots)
        .set({ bookedSeats: sql`${bookingSlots.bookedSeats} + ${input.seats}` })
        .where(and(eq(bookingSlots.id, slot.id), ne(bookingSlots.status, "cancelled"), sql`${bookingSlots.bookedSeats} + ${input.seats} <= ${bookingSlots.capacity}`))
        .returning({ bookedSeats: bookingSlots.bookedSeats });
      if (!taken) {
        const left = seatsLeft(slot);
        const message = left <= 0 ? "This slot is full. Increase the number of seats first (Edit slot)." : `Only ${left} ${left === 1 ? "seat is" : "seats are"} left on this slot.`;
        invalid({ seats: [message] }, message);
      }

      const code = await nextCode("BKG", { tx });
      const [booking] = await tx
        .insert(slotBookings)
        .values({
          code,
          slotId: slot.id,
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          trade: input.trade,
          organizationName: input.organizationName || null,
          seats: input.seats,
          notes: input.notes || null,
          consentToContact: true,
          source: "staff",
          createdByUserId: ctx.user.id,
        })
        .returning({ id: slotBookings.id });
      await audit({
        action: "slot_booking.created",
        entityType: "slot_booking",
        entityId: booking!.id,
        actorUserId: ctx.user.id,
        metadata: { code, slotId: slot.id, slotCode: slot.code, seats: input.seats, organisationBooking: Boolean(input.organizationName), source: "staff" },
        tx,
      });
      return { id: booking!.id, code, slotId: slot.id };
    });
  } catch (error) {
    if (isActivePhoneConflict(error)) throw new ActionError("This mobile number already has a booking on this date.", { fieldErrors: { phone: ["Already booked on this date"] } });
    throw error;
  }
}

/**
 * Mark a booking attended, did not come (no_show), cancelled, or back to booked. Cancelling gives the seats back;
 * un-cancelling takes them again (only while seats are free). Bookings on a cancelled slot stay as they are.
 */
export async function setBookingStatus(ctx: StaffContext, input: { id: string; status: SlotBookingStatus }): Promise<{ slotId: string; changed: boolean }> {
  assertBookingsStaff(ctx);
  try {
    return await db.transaction(async (tx) => {
      // Lock the slot first, then the booking: the order cancelSlot uses (slot, then its bookings). The other way
      // round, a tap on "Came" while someone cancels the date deadlocks and one of them fails. A booking never
      // moves to another slot, so reading its slot id without a lock is safe.
      const [ref] = await tx.select({ slotId: slotBookings.slotId }).from(slotBookings).where(eq(slotBookings.id, input.id)).limit(1);
      if (!ref) throw new ActionError("This booking could not be found.", { code: "not_found" });
      const slot = await lockSlot(ref.slotId, tx);
      const [booking] = await tx.select().from(slotBookings).where(eq(slotBookings.id, input.id)).for("update").limit(1);
      if (!booking) throw new ActionError("This booking could not be found.", { code: "not_found" });
      if (booking.status === input.status) return { slotId: slot.id, changed: false };
      if (slot.status === "cancelled") throw new ActionError("This slot was cancelled, so its bookings cannot be changed.");

      const freeing = input.status === "cancelled";
      const retaking = booking.status === "cancelled";
      if (freeing) {
        await tx
          .update(bookingSlots)
          .set({ bookedSeats: sql`greatest(${bookingSlots.bookedSeats} - ${booking.seats}, 0)` })
          .where(eq(bookingSlots.id, slot.id));
      } else if (retaking) {
        const [taken] = await tx
          .update(bookingSlots)
          .set({ bookedSeats: sql`${bookingSlots.bookedSeats} + ${booking.seats}` })
          .where(and(eq(bookingSlots.id, slot.id), sql`${bookingSlots.bookedSeats} + ${booking.seats} <= ${bookingSlots.capacity}`))
          .returning({ id: bookingSlots.id });
        if (!taken) {
          const left = seatsLeft(slot);
          throw new ActionError(`Not enough free seats to restore this booking (${booking.seats} needed, ${left} free). Increase the seats first (Edit slot).`);
        }
      }

      const stamp = new Date();
      await tx
        .update(slotBookings)
        .set({ status: input.status, statusChangedAt: stamp, statusChangedByUserId: ctx.user.id, ...(retaking ? { cancelledWithSlot: false } : {}) })
        .where(eq(slotBookings.id, booking.id));
      await audit({
        action: "slot_booking.status_changed",
        entityType: "slot_booking",
        entityId: booking.id,
        actorUserId: ctx.user.id,
        metadata: { code: booking.code, slotId: slot.id, from: booking.status, to: input.status, seats: booking.seats },
        tx,
      });
      return { slotId: slot.id, changed: true };
    });
  } catch (error) {
    if (isActivePhoneConflict(error)) throw new ActionError("This mobile number already has another booking on this date, so this one cannot be restored.");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Staff: slots
// ---------------------------------------------------------------------------

async function assertCourse(courseId: string | undefined, tx: DbOrTx): Promise<string | null> {
  if (!courseId) return null;
  const [course] = await tx
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), sql`${courses.deletedAt} is null`))
    .limit(1);
  if (!course) invalid({ courseId: ["Choose a course from the list"] });
  return course.id;
}

function slotValues(input: BookingSlotInput) {
  return {
    kind: input.kind,
    title: input.title,
    trade: input.trade,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime ?? null,
    venue: input.venue?.trim() || CONTACT.address.oneLine,
    capacity: input.capacity,
    instructions: input.instructions || null,
    feeNote: input.feeNote || null,
  };
}

/** Open a new slot (taking bookings at once). The date must be today or later; blank venue = the office address. */
export async function createSlot(ctx: StaffContext, input: BookingSlotInput, now: Date = new Date()): Promise<{ id: string; code: string }> {
  assertBookingsStaff(ctx);
  if (input.date < venueNow(now).date) invalid({ date: ["Choose today or a later date"] });
  return db.transaction(async (tx) => {
    const courseId = await assertCourse(input.courseId, tx);
    const code = await nextCode("SLT", { tx });
    const [slot] = await tx
      .insert(bookingSlots)
      .values({ ...slotValues(input), code, courseId, status: "open", createdByUserId: ctx.user.id })
      .returning({ id: bookingSlots.id });
    await audit({
      action: "booking_slot.created",
      entityType: "booking_slot",
      entityId: slot!.id,
      actorUserId: ctx.user.id,
      metadata: { code, kind: input.kind, date: input.date, startTime: input.startTime, capacity: input.capacity, courseId },
      tx,
    });
    return { id: slot!.id, code };
  });
}

/**
 * Edit a slot. Seats cannot go below what is already booked; a cancelled slot cannot be edited. Returns whether
 * the date, time or place changed and how many active bookings there are, so the page can remind staff to tell them.
 */
export async function updateSlot(ctx: StaffContext, input: BookingSlotInput & { id: string }, now: Date = new Date()): Promise<{ id: string; scheduleChanged: boolean; activeBookings: number }> {
  assertBookingsStaff(ctx);
  return db.transaction(async (tx) => {
    const slot = await lockSlot(input.id, tx);
    if (slot.status === "cancelled") throw new ActionError("A cancelled slot cannot be changed. Create a new slot instead.");
    if (input.capacity < slot.bookedSeats) invalid({ capacity: [`${slot.bookedSeats} seats are already booked. Enter ${slot.bookedSeats} or more.`] });
    if (input.date !== slot.date && input.date < venueNow(now).date) invalid({ date: ["Choose today or a later date"] });
    const courseId = await assertCourse(input.courseId, tx);
    const values = { ...slotValues(input), courseId };
    const changed = (Object.keys(values) as (keyof typeof values)[]).filter((k) => (slot[k] ?? null) !== (values[k] ?? null));
    if (!changed.length) return { id: slot.id, scheduleChanged: false, activeBookings: 0 };
    await tx.update(bookingSlots).set(values).where(eq(bookingSlots.id, slot.id));
    const [active] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(slotBookings)
      .where(and(eq(slotBookings.slotId, slot.id), ne(slotBookings.status, "cancelled")));
    await audit({ action: "booking_slot.updated", entityType: "booking_slot", entityId: slot.id, actorUserId: ctx.user.id, metadata: { code: slot.code, changed }, tx });
    const scheduleChanged = changed.some((k) => k === "date" || k === "startTime" || k === "endTime" || k === "venue");
    return { id: slot.id, scheduleChanged, activeBookings: Number(active?.value ?? 0) };
  });
}

/** Stop new bookings (closed) or take them again (open). Existing bookings stay. Cancelled slots stay cancelled. */
export async function setSlotOpen(ctx: StaffContext, input: { id: string; open: boolean }): Promise<void> {
  assertBookingsStaff(ctx);
  await db.transaction(async (tx) => {
    const slot = await lockSlot(input.id, tx);
    if (slot.status === "cancelled") throw new ActionError("This slot was cancelled. Create a new slot instead.");
    const status = input.open ? "open" : "closed";
    if (slot.status === status) return;
    await tx.update(bookingSlots).set({ status }).where(eq(bookingSlots.id, slot.id));
    await audit({ action: input.open ? "booking_slot.reopened" : "booking_slot.closed", entityType: "booking_slot", entityId: slot.id, actorUserId: ctx.user.id, metadata: { code: slot.code }, tx });
  });
}

/**
 * Cancel a slot (final). Every booking still "booked" is cancelled with it and its seats are given back; those
 * people are listed on the slot page ("Tell these people") with a WhatsApp button each. The reason is staff-only.
 */
export async function cancelSlot(ctx: StaffContext, input: { id: string; reason: string }): Promise<{ toInform: number }> {
  assertBookingsStaff(ctx);
  const reason = input.reason.trim();
  if (!reason) invalid({ reason: ["Type the reason"] });
  return db.transaction(async (tx) => {
    const slot = await lockSlot(input.id, tx);
    if (slot.status === "cancelled") return { toInform: 0 };
    const stamp = new Date();
    const cancelled = await tx
      .update(slotBookings)
      .set({ status: "cancelled", cancelledWithSlot: true, statusChangedAt: stamp, statusChangedByUserId: ctx.user.id })
      .where(and(eq(slotBookings.slotId, slot.id), eq(slotBookings.status, "booked")))
      .returning({ seats: slotBookings.seats });
    const freed = cancelled.reduce((sum, b) => sum + b.seats, 0);
    await tx
      .update(bookingSlots)
      .set({
        status: "cancelled",
        cancelReason: reason,
        cancelledAt: stamp,
        cancelledByUserId: ctx.user.id,
        bookedSeats: sql`greatest(${bookingSlots.bookedSeats} - ${freed}, 0)`,
      })
      .where(eq(bookingSlots.id, slot.id));
    await audit({
      action: "booking_slot.cancelled",
      entityType: "booking_slot",
      entityId: slot.id,
      actorUserId: ctx.user.id,
      metadata: { code: slot.code, bookingsCancelled: cancelled.length, seatsFreed: freed, reasonLength: reason.length },
      tx,
    });
    return { toInform: cancelled.length };
  });
}
