/**
 * Trade test and training seat bookings — labels, limits and zod schemas (client-safe: the public /book form,
 * the Command Centre forms and the services share them).
 */
import { z } from "zod";

import type { PlatformPermission } from "@/config/permissions";
import type { BookingSlotKind, BookingSlotStatus, SlotBookingStatus } from "@/db/schema/bookings";
import { f } from "@/lib/validation";

/**
 * Staff permission for /admin/bookings (view and manage): "Schedule and record skill / trade assessments". It is
 * the one existing permission held by every role that runs trade tests and training days (Training Coordinator,
 * Recruiter, Operations Manager, Administrator). Phone numbers additionally need candidates.view_contact.
 */
export const BOOKINGS_PERMISSION = "recruitment.assessments" satisfies PlatformPermission;

export const BOOKINGS_ADMIN_PATH = "/admin/bookings";
export const BOOK_PUBLIC_PATH = "/book";

export const BOOKING_KIND_LABELS = {
  trade_test: "Trade test",
  training: "Training",
} as const satisfies Record<BookingSlotKind, string>;
export const BOOKING_KIND_VALUES = Object.keys(BOOKING_KIND_LABELS) as [BookingSlotKind, ...BookingSlotKind[]];

export const SLOT_STATUS_LABELS = {
  open: "Open for booking",
  closed: "Closed",
  cancelled: "Cancelled",
} as const satisfies Record<BookingSlotStatus, string>;

export const SLOT_STATUS_TONE = {
  open: "success",
  closed: "neutral",
  cancelled: "danger",
} as const satisfies Record<BookingSlotStatus, string>;

export const BOOKING_STATUS_LABELS = {
  booked: "Booked",
  attended: "Attended",
  no_show: "Did not come",
  cancelled: "Cancelled",
} as const satisfies Record<SlotBookingStatus, string>;
export const BOOKING_STATUS_VALUES = Object.keys(BOOKING_STATUS_LABELS) as [SlotBookingStatus, ...SlotBookingStatus[]];

export const BOOKING_STATUS_TONE = {
  booked: "info",
  attended: "success",
  no_show: "warning",
  cancelled: "neutral",
} as const satisfies Record<SlotBookingStatus, string>;

/** Seats one booking may take (a travel agency or company bringing a group). */
export const MAX_SEATS_PER_BOOKING = 20;
export const MAX_SLOT_CAPACITY = 500;

export const SLOT_CODE_PATTERN = /^VSG-SLT-\d{4,10}$/;
export const BOOKING_CODE_PATTERN = /^VSG-BKG-\d{4,10}$/;

const optionalBlank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/** Hidden honeypot input: accepted (never a validation error, so bots learn nothing); the service checks it. */
const honeypot = z.string().max(500).optional();

const blankToUndefined = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : v);
const seatsNumber = z.coerce
  .number({ error: "Enter the number of seats" })
  .int("Enter a whole number")
  .min(1, "Book at least 1 seat")
  .max(MAX_SEATS_PER_BOOKING, `Up to ${MAX_SEATS_PER_BOOKING} seats at a time. For more, WhatsApp us.`);
const optionalSeats = z.preprocess(blankToUndefined, seatsNumber.optional());
/** Staff wording: "WhatsApp us" makes no sense to the office itself. */
const staffSeats = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: "Enter the number of seats" })
    .int("Enter a whole number")
    .min(1, "Book at least 1 seat")
    .max(MAX_SEATS_PER_BOOKING, `Up to ${MAX_SEATS_PER_BOOKING} seats in one booking. Add another booking for more.`),
);

const optionalEmail = optionalBlank(z.string().trim().toLowerCase().max(254, "Too long").pipe(z.email("Enter a valid email address, or leave it empty")));

/**
 * Public booking form (/book/<slot code>). An individual books one seat; "Booking for a company or travel
 * agency?" adds the organisation name and a number of seats (1–20). Output is normalised for the service.
 */
export const bookingRequestSchema = z
  .object({
    slot: z
      .string({ error: "Choose a date" })
      .trim()
      .toUpperCase()
      .regex(SLOT_CODE_PATTERN, "Choose a date"),
    name: f.text({ label: "Your name", max: 120 }),
    phone: f.phone(),
    trade: f.text({ label: "Your trade", max: 80 }),
    email: optionalEmail,
    forOrganization: f.bool(),
    organizationName: f.optionalText(160),
    seats: optionalSeats,
    consentToContact: f.bool().refine((v) => v === true, { message: "Please agree that we may call or WhatsApp you about this booking" }),
    website: honeypot,
  })
  .superRefine((v, ctx) => {
    if (!v.forOrganization) return;
    if (!v.organizationName) ctx.addIssue({ code: "custom", path: ["organizationName"], message: "Type the company or travel agency name" });
    if (v.seats === undefined) ctx.addIssue({ code: "custom", path: ["seats"], message: "How many seats do you need?" });
  })
  .transform((v) => ({
    slotCode: v.slot,
    name: v.name,
    phone: v.phone,
    trade: v.trade,
    email: v.email ?? null,
    organizationName: v.forOrganization ? (v.organizationName ?? null) : null,
    seats: v.forOrganization ? (v.seats ?? 1) : 1,
    consentToContact: v.consentToContact,
    website: v.website,
  }));
export type BookingRequestInput = z.output<typeof bookingRequestSchema>;

/** Staff adding a booking for someone who called or walked in (no honeypot or rate limits). */
export const staffBookingSchema = z.object({
  slotId: f.uuid(),
  name: f.text({ label: "Name", max: 120 }),
  phone: f.phone(),
  trade: f.text({ label: "Trade", max: 80 }),
  email: optionalEmail,
  organizationName: f.optionalText(160),
  seats: staffSeats,
  notes: f.optionalText(1000),
  consentToContact: f.bool().refine((v) => v === true, { message: "Confirm that the person agreed to be called or WhatsApped about this booking" }),
});
export type StaffBookingInput = z.output<typeof staffBookingSchema>;

/** YYYY-MM-DD that is a real calendar date. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && value >= "2020-01-01" && value <= "2100-12-31";
}

/** <input type="time"> value ("09:30" or "09:30:00") → "09:30". */
const clock = (label: string) =>
  z
    .string({ error: `Enter the ${label}` })
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, `Enter the ${label}, for example 09:30`)
    .transform((v) => v.slice(0, 5));

/** Create or edit a slot (Command Centre). Blank venue = the office address. */
export const bookingSlotSchema = z
  .object({
    id: f.optionalUuid(),
    kind: f.enumOf(BOOKING_KIND_VALUES, "Choose trade test or training"),
    title: f.text({ label: "Title", max: 120 }),
    trade: f.text({ label: "Trade", max: 80 }),
    courseId: optionalBlank(z.uuid("Choose a course from the list")),
    date: z
      .string({ error: "Choose the date" })
      .trim()
      .refine(isCalendarDate, "Choose a valid date"),
    startTime: clock("start time"),
    endTime: optionalBlank(clock("end time")),
    venue: f.optionalText(300),
    capacity: z.coerce
      .number({ error: "Enter the number of seats" })
      .int("Enter a whole number")
      .min(1, "At least 1 seat")
      .max(MAX_SLOT_CAPACITY, `At most ${MAX_SLOT_CAPACITY} seats`),
    instructions: f.optionalText(1000),
    feeNote: f.optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (v.endTime && v.endTime <= v.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "The end time must be after the start time" });
  });
export type BookingSlotInput = z.output<typeof bookingSlotSchema>;

export const slotIdSchema = z.object({ id: f.uuid() });

export const slotCancelSchema = z.object({
  id: f.uuid(),
  reason: f.text({ label: "Reason", max: 300 }),
});

export const bookingStatusSchema = z.object({
  id: f.uuid(),
  status: f.enumOf(BOOKING_STATUS_VALUES),
});

/** Public /book filters (?kind=trade_test|training, ?course=<course slug>); bad values are ignored. */
export const publicSlotFiltersSchema = z.object({
  kind: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/-/g, "_") : v), z.enum(BOOKING_KIND_VALUES).optional()).catch(undefined),
  course: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional()
    .catch(undefined),
});
export type PublicSlotFilters = z.output<typeof publicSlotFiltersSchema>;

/** Staff list: upcoming (today on, soonest first) or past (most recent first). */
export const staffSlotFiltersSchema = z.object({
  when: z.enum(["upcoming", "past"]).catch("upcoming"),
});
export type StaffSlotFilters = z.output<typeof staffSlotFiltersSchema>;

/** Slot details anyone may see (public pages, confirmation, calendar file). */
export type PublicSlotView = {
  code: string;
  kind: BookingSlotKind;
  title: string;
  trade: string;
  courseTitle: string | null;
  courseSlug: string | null;
  /** YYYY-MM-DD at the venue. */
  date: string;
  /** "HH:MM" at the venue. */
  startTime: string;
  endTime: string | null;
  venue: string;
  instructions: string | null;
  feeNote: string | null;
  seatsLeft: number;
  /** open = can be booked now; full; closed / cancelled / past = no new bookings. */
  state: "open" | "full" | "closed" | "cancelled" | "past";
};

/** What the public form gets back after booking. */
export type BookingResult = {
  /**
   * Booking code. Null when the request was dropped as spam (the visitor still sees a confirmation), or when the
   * number already had a booking on this date under another name (its code is never shown to someone else).
   */
  code: string | null;
  /** This phone number already had a booking on this date: nothing new was taken (see `code`). */
  existing: boolean;
  name: string;
  seats: number;
  organizationName: string | null;
  slot: PublicSlotView;
};
