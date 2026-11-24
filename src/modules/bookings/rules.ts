/**
 * Pure booking helpers (client-safe, unit-tested): venue clock, seat counts, date and time wording, grouping,
 * WhatsApp messages and the calendar (.ics) file. Formatting is done by hand (not Intl) so the server and the
 * browser always print the same text.
 */
import { BOOKING_KIND_LABELS, type PublicSlotView } from "./schemas";

/** Slots are held at the Venkat Sai centre in Visakhapatnam: dates and times are India Standard Time. */
export const VENUE_TIME_ZONE = "Asia/Kolkata";
/** IST is UTC+05:30 all year (no daylight saving), so a fixed offset is exact. */
export const VENUE_UTC_OFFSET_MINUTES = 330;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Today's date and the time of day at the venue: { date: "2026-11-23", time: "14:05" }. */
export function venueNow(now: Date = new Date()): { date: string; time: string } {
  const shifted = new Date(now.getTime() + VENUE_UTC_OFFSET_MINUTES * 60_000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/** The slot starts later than `now` (venue time). Bookings close when the slot starts. */
export function isSlotUpcoming(slot: { date: string; startTime: string }, now: Date = new Date()): boolean {
  const n = venueNow(now);
  return slot.date > n.date || (slot.date === n.date && slot.startTime > n.time);
}

export function seatsLeft(slot: { capacity: number; bookedSeats: number }): number {
  return Math.max(0, slot.capacity - slot.bookedSeats);
}

/** "Full", "1 seat left", "12 seats left". */
export function seatsLeftLabel(left: number): string {
  if (left <= 0) return "Full";
  return left === 1 ? "1 seat left" : `${left} seats left`;
}

/** "1 seat", "5 seats". */
export function seatsLabel(seats: number): string {
  return seats === 1 ? "1 seat" : `${seats} seats`;
}

function nameKey(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("en").replace(/[.\s]+/g, " ").trim();
}

/** The same name as people retype it: case, extra spaces and dots do not matter ("Ravi  Kumar" = "ravi kumar."). */
export function sameName(a: string, b: string): boolean {
  const key = nameKey(a);
  return key !== "" && key === nameKey(b);
}

function calendarParts(isoDate: string): { weekday: string; day: number; month: string; year: number } | null {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return { weekday: WEEKDAYS[d.getUTCDay()]!, day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()]!, year: d.getUTCFullYear() };
}

/** "Friday, 5 December 2026" (long) or "Fri 5 Dec" (short). */
export function formatSlotDate(isoDate: string, style: "long" | "short" = "long"): string {
  const p = calendarParts(isoDate);
  if (!p) return isoDate;
  return style === "long" ? `${p.weekday}, ${p.day} ${p.month} ${p.year}` : `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}`;
}

/** "09:30" → "9:30 am", "12:00" → "12:00 pm", "00:15" → "12:15 am". */
export function formatClock(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** "9:30 am to 1:00 pm" or "9:30 am". */
export function formatTimeRange(start: string, end: string | null | undefined): string {
  return end ? `${formatClock(start)} to ${formatClock(end)}` : formatClock(start);
}

/** Consecutive items grouped by their date, order kept: [{ date, items }]. */
export function groupByDate<T extends { date: string }>(items: readonly T[]): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}

/** Venue date + "HH:MM" → the instant (UTC). */
export function venueDateTimeToUtc(isoDate: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const utcMidnight = Date.parse(`${isoDate}T00:00:00.000Z`);
  return new Date(utcMidnight + ((h ?? 0) * 60 + (m ?? 0) - VENUE_UTC_OFFSET_MINUTES) * 60_000);
}

type SlotWords = Pick<PublicSlotView, "title" | "date" | "startTime" | "endTime">;

function when(slot: SlotWords): string {
  return `${formatSlotDate(slot.date)} at ${formatClock(slot.startTime)}`;
}

/**
 * WhatsApp message from the person to the office after booking (prefilled on the confirmation). `existing` without a
 * code: the number already had a booking under another name, so the person asks for it (staff answer that number only).
 */
export function officeWhatsAppMessage(input: { code: string | null; existing?: boolean; name: string; seats: number; organizationName: string | null; slot: SlotWords }): string {
  if (input.existing && !input.code) {
    return [`Hello Venkat Sai, my mobile number already has a booking for ${input.slot.title} on ${when(input.slot)}.`, input.name ? `Name: ${input.name}.` : null, "Please send me the booking details."]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `Hello Venkat Sai, I booked ${input.slot.title} on ${when(input.slot)}.`,
    input.code ? `Booking: ${input.code}.` : null,
    input.name ? `Name: ${input.name}.` : null,
    input.organizationName ? `Company / agency: ${input.organizationName}, ${seatsLabel(input.seats)}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Staff → the person who booked (their own number). */
export function personWhatsAppMessage(input: { name: string; code: string; slot: SlotWords }): string {
  return `Hello ${input.name}, this is Venkat Sai about your booking ${input.code} for ${input.slot.title} on ${when(input.slot)}.`;
}

/** Staff → the person, after the date, time or place of their slot changed. */
export function changedWhatsAppMessage(input: { name: string; code: string; slot: SlotWords & { venue: string } }): string {
  return `Hello ${input.name}, this is Venkat Sai. ${input.slot.title} has changed. New date: ${formatSlotDate(input.slot.date)}, ${formatTimeRange(input.slot.startTime, input.slot.endTime)}, at ${input.slot.venue}. Your booking ${input.code} stays. Please reply to confirm you can come.`;
}

/** Staff → the person, when the whole slot is cancelled. */
export function cancelledWhatsAppMessage(input: { name: string; code: string; reason: string | null; slot: SlotWords }): string {
  return [
    `Hello ${input.name}, this is Venkat Sai. Sorry, ${input.slot.title} on ${when(input.slot)} is cancelled.`,
    input.reason ? `Reason: ${input.reason}.` : null,
    `Your booking ${input.code} is cancelled. We will tell you the new date.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Staff sharing the booking link in WhatsApp groups (wa.me without a number opens the chat picker). */
export function shareSlotMessage(input: { slot: SlotWords & { kind: PublicSlotView["kind"]; venue: string }; seatsLeft: number; url: string }): string {
  return [
    `${BOOKING_KIND_LABELS[input.slot.kind]}: ${input.slot.title}`,
    `${formatSlotDate(input.slot.date)}, ${formatTimeRange(input.slot.startTime, input.slot.endTime)}`,
    input.slot.venue,
    seatsLeftLabel(input.seatsLeft),
    `Book your seat: ${input.url}`,
  ].join("\n");
}

/** wa.me share link with no number (lets staff pick a chat or group). */
export function whatsappShareHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// ---------------------------------------------------------------------------
// Calendar file (RFC 5545)
// ---------------------------------------------------------------------------

/** Escape TEXT values: backslash, semicolon, comma and line breaks. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

/** Fold a content line at 75 octets (continuation lines start with one space), never inside a character. */
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const len = utf8Length(ch);
    const limit = out.length === 0 ? 75 : 74;
    if (size + len > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += len;
  }
  out.push(current);
  return out.join("\r\n ");
}

function icsUtc(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export type IcsEventInput = {
  uid: string;
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string | null;
  /** DTSTAMP (when the file was made). */
  stamp: Date;
};

/** A one-event calendar file (CRLF line endings). Without an end time the event has no DTEND (a start-time reminder). */
export function buildIcs(event: IcsEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Venkat Sai Global//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsUtc(event.stamp)}`,
    `DTSTART:${icsUtc(venueDateTimeToUtc(event.date, event.startTime))}`,
    event.endTime ? `DTEND:${icsUtc(venueDateTimeToUtc(event.date, event.endTime))}` : null,
    `SUMMARY:${icsEscape(event.title)}`,
    `LOCATION:${icsEscape(event.location)}`,
    `DESCRIPTION:${icsEscape(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
