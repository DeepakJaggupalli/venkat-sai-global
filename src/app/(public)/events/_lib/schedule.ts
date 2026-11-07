/**
 * Pure event scheduling helpers (client-safe). Times are ISO 8601 strings from the CMS; display uses the
 * event's own IANA time zone so a job fair in Visakhapatnam reads in IST wherever the visitor is.
 */

import { isoDate } from "../../news/_lib/text";

export type EventTiming = "upcoming" | "ongoing" | "past" | "unscheduled";

/** Where an event is relative to `now` (an event without an end lasts until its start + 0). */
export function eventTiming(startsAt: string | null | undefined, endsAt: string | null | undefined, now: Date = new Date()): EventTiming {
  const start = isoDate(startsAt);
  if (!start) return "unscheduled";
  const end = isoDate(endsAt) ?? start;
  if (now < start) return "upcoming";
  if (now <= end) return "ongoing";
  return "past";
}

export type RegistrationState =
  | { kind: "none" }
  | { kind: "open"; url: string | null; deadline: Date | null; required: boolean }
  | { kind: "closed"; reason: "deadline" | "event_over" };

/** Whether visitors can still register, from the registration group and the event timing. */
export function registrationState(
  registration: { required?: boolean | null; url?: string | null; deadline?: string | null } | null | undefined,
  timing: EventTiming,
  now: Date = new Date(),
): RegistrationState {
  const url = registration?.url?.trim() || null;
  const required = registration?.required === true;
  if (!url && !required) return { kind: "none" };
  if (timing === "past") return { kind: "closed", reason: "event_over" };
  const deadline = isoDate(registration?.deadline);
  if (deadline && now > deadline) return { kind: "closed", reason: "deadline" };
  return { kind: "open", url, deadline, required };
}

function parts(date: Date, timeZone: string) {
  // Assemble "Sat, 14 Nov 2026" from parts: ICU versions punctuate the joined en-IN string differently.
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "short", day: "numeric", weekday: "short" }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  const time = new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return { day: `${p.weekday}, ${p.day} ${p.month} ${p.year}`, time: time.format(date), dayKey };
}

/** Short zone label such as "IST" or "GMT+4" for the given instant. */
export function zoneLabel(date: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName");
  return name?.value ?? timeZone;
}

/**
 * Human schedule in the event's zone: "Sat, 14 Nov 2026, 10:00 am – 4:00 pm IST" (same day) or
 * "Sat, 14 Nov 2026, 10:00 am – Sun, 15 Nov 2026, 1:00 pm IST".
 */
export function formatEventSchedule(startsAt: string, endsAt: string | null | undefined, timeZone: string): string {
  const start = isoDate(startsAt);
  if (!start) return "Date to be announced";
  const s = parts(start, timeZone);
  const zone = zoneLabel(start, timeZone);
  const end = isoDate(endsAt);
  if (!end) return `${s.day}, ${s.time} ${zone}`;
  const e = parts(end, timeZone);
  if (e.dayKey === s.dayKey) return `${s.day}, ${s.time} – ${e.time} ${zone}`;
  return `${s.day}, ${s.time} – ${e.day}, ${e.time} ${zone}`;
}

/** Country name for an ISO alpha-2 code (English), falling back to the code. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
