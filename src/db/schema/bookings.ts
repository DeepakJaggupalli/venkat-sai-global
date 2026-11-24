/**
 * Online booking of trade tests (for example a 6G pipe welding test) and training seats at the Venkat Sai
 * testing centre. Layer 21 — after core (users) and training (a slot may be for a course).
 *
 * Staff open dated slots with a fixed number of seats (/admin/bookings). Workers book one seat; travel agencies
 * and companies book several seats in one go (/book). Seats are taken atomically: booking_slots.bookedSeats is
 * the sum of `seats` of the slot's bookings that are not cancelled, and never exceeds `capacity`.
 *
 * Personal data (name, phone, optional email) is supplied voluntarily to book and to be contacted about the
 * booking (consent required). `ipHash` only, never the raw IP.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { pk, timestamps, tstz } from "./_shared";
import { users } from "./core";
import { courses } from "./training";

export const BOOKING_SLOT_KINDS = ["trade_test", "training"] as const;
export type BookingSlotKind = (typeof BOOKING_SLOT_KINDS)[number];

/** open = taking bookings · closed = no new bookings (existing ones stay) · cancelled = called off (final). */
export const BOOKING_SLOT_STATUSES = ["open", "closed", "cancelled"] as const;
export type BookingSlotStatus = (typeof BOOKING_SLOT_STATUSES)[number];

/** Every status except cancelled holds its seats. */
export const SLOT_BOOKING_STATUSES = ["booked", "attended", "no_show", "cancelled"] as const;
export type SlotBookingStatus = (typeof SLOT_BOOKING_STATUSES)[number];

/** How a booking was made: the public /book form, or added by staff (phone call, walk-in). */
export const SLOT_BOOKING_SOURCES = ["website", "staff"] as const;
export type SlotBookingSource = (typeof SLOT_BOOKING_SOURCES)[number];

export const bookingSlots = pgTable(
  "booking_slots",
  {
    id: pk(),
    /** VSG-SLT-000123 — nextCode("SLT"). Public: used in the booking link /book/<code>. */
    code: text().notNull(),
    kind: text({ enum: BOOKING_SLOT_KINDS }).notNull(),
    /** "6G pipe welding test", "Scaffolding training (morning batch)". */
    title: text().notNull(),
    /** Trade the slot is for, as shown to the public ("Pipe welder 6G"). */
    trade: text().notNull(),
    /** Training seats for a course (the course page links to its open slots). */
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    /** Calendar date at the venue. */
    date: date({ mode: "string" }).notNull(),
    /** "HH:MM" local time at the venue. */
    startTime: text().notNull(),
    endTime: text(),
    /** Where to come (the office address unless staff typed another). */
    venue: text().notNull(),
    capacity: integer().notNull(),
    bookedSeats: integer().notNull().default(0),
    status: text({ enum: BOOKING_SLOT_STATUSES }).notNull().default("open"),
    /** What to bring / how to prepare ("Bring passport copy and safety shoes"). */
    instructions: text(),
    /** Free text typed by staff about any fee (shown as written; the system never states amounts itself). */
    feeNote: text(),
    /** Why the slot was cancelled (staff only; the people who booked are told on WhatsApp). */
    cancelReason: text(),
    cancelledAt: tstz(),
    cancelledByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("booking_slots_code_uq").on(t.code),
    index("booking_slots_date_idx").on(t.date, t.startTime),
    // Public /book list: open slots from today on.
    index("booking_slots_open_idx").on(t.date, t.startTime).where(sql`status = 'open'`),
    index("booking_slots_course_idx").on(t.courseId),
    index("booking_slots_created_by_idx").on(t.createdByUserId),
    index("booking_slots_cancelled_by_idx").on(t.cancelledByUserId),
    check("booking_slots_capacity_chk", sql`${t.capacity} between 1 and 500`),
    check("booking_slots_booked_seats_chk", sql`${t.bookedSeats} >= 0 and ${t.bookedSeats} <= ${t.capacity}`),
    // "HH:MM", 24-hour clock (zero-padded, so text comparison orders times correctly).
    check("booking_slots_start_time_chk", sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("booking_slots_end_time_chk", sql`${t.endTime} is null or (${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.endTime} > ${t.startTime})`),
    check("booking_slots_title_chk", sql`btrim(${t.title}) <> '' and char_length(${t.title}) <= 120`),
    check("booking_slots_trade_chk", sql`btrim(${t.trade}) <> '' and char_length(${t.trade}) <= 80`),
    check("booking_slots_venue_chk", sql`btrim(${t.venue}) <> '' and char_length(${t.venue}) <= 300`),
    check("booking_slots_instructions_chk", sql`${t.instructions} is null or char_length(${t.instructions}) <= 1000`),
    check("booking_slots_fee_note_chk", sql`${t.feeNote} is null or char_length(${t.feeNote}) <= 200`),
    check("booking_slots_cancel_chk", sql`${t.status} <> 'cancelled' or ${t.cancelledAt} is not null`),
  ],
);

export const slotBookings = pgTable(
  "slot_bookings",
  {
    id: pk(),
    /** VSG-BKG-000123 — nextCode("BKG"). Shown to the person and quoted on WhatsApp. */
    code: text().notNull(),
    slotId: uuid()
      .notNull()
      .references(() => bookingSlots.id),
    /** The worker, or the contact person of a travel agency / company booking. */
    name: text().notNull(),
    /** E.164 mobile / WhatsApp number. */
    phone: text().notNull(),
    /** Optional, lower-cased. */
    email: text(),
    /** Trade of the worker(s), as typed. */
    trade: text().notNull(),
    /** Travel agency or company booking several seats (null = an individual worker). */
    organizationName: text(),
    seats: smallint().notNull().default(1),
    status: text({ enum: SLOT_BOOKING_STATUSES }).notNull().default("booked"),
    /** Staff-only notes (never shown to the person). */
    notes: text(),
    /** Cancelled because staff cancelled the whole slot (these people must be told). */
    cancelledWithSlot: boolean().notNull().default(false),
    statusChangedAt: tstz(),
    statusChangedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Consent to be called / WhatsApped about the booking (required). */
    consentToContact: boolean().notNull(),
    /** Version of the privacy notice shown on the form. */
    privacyNoticeVersion: text(),
    source: text({ enum: SLOT_BOOKING_SOURCES }).notNull().default("website"),
    /** Set when the visitor was signed in (or the staff member who added it, see createdByUserId). */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ipHash: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("slot_bookings_code_uq").on(t.code),
    index("slot_bookings_slot_idx").on(t.slotId, t.createdAt),
    // One active booking per phone per slot (a second request returns the existing booking).
    uniqueIndex("slot_bookings_active_phone_uq").on(t.slotId, t.phone).where(sql`status <> 'cancelled'`),
    index("slot_bookings_phone_idx").on(t.phone),
    index("slot_bookings_user_idx").on(t.userId),
    index("slot_bookings_created_by_idx").on(t.createdByUserId),
    index("slot_bookings_status_changed_by_idx").on(t.statusChangedByUserId),
    check("slot_bookings_seats_chk", sql`${t.seats} between 1 and 20`),
    check("slot_bookings_consent_chk", sql`${t.consentToContact} = true`),
    check("slot_bookings_name_chk", sql`btrim(${t.name}) <> '' and char_length(${t.name}) <= 120`),
    check("slot_bookings_trade_chk", sql`btrim(${t.trade}) <> '' and char_length(${t.trade}) <= 80`),
    check("slot_bookings_email_chk", sql`${t.email} is null or (char_length(${t.email}) <= 254 and ${t.email} = lower(${t.email}))`),
    check("slot_bookings_org_chk", sql`${t.organizationName} is null or (btrim(${t.organizationName}) <> '' and char_length(${t.organizationName}) <= 160)`),
    check("slot_bookings_notes_chk", sql`${t.notes} is null or char_length(${t.notes}) <= 1000`),
  ],
);
