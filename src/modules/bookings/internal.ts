import "server-only";

import { and, eq, gt, or, type SQL } from "drizzle-orm";

import { bookingSlots } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { isSlotUpcoming, seatsLeft, venueNow } from "./rules";
import { BOOKINGS_PERMISSION, type PublicSlotView } from "./schemas";

/** Shared helpers for the bookings queries and services (authorisation, rate limits, row mapping). */

export type SlotRow = typeof bookingSlots.$inferSelect;
export type CourseRef = { title: string | null; slug: string | null } | null;

export function assertBookingsStaff(ctx: StaffContext): void {
  if (!staffCan(ctx, BOOKINGS_PERMISSION)) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

/** Apply several fixed-window limits; the request is refused when any is exceeded. */
export async function enforceRateLimits(limits: { key: string; limit: number; windowSeconds: number }[], message: string): Promise<void> {
  for (const l of limits) {
    const result = await rateLimit(l.key, l.limit, l.windowSeconds);
    if (!result.allowed) throw new ActionError(message, { code: "rate_limited" });
  }
}

/** PostgreSQL error code / constraint of a failed statement (drizzle wraps driver errors in `cause`). */
export function pgError(error: unknown): { code?: string; constraint?: string } {
  for (const c of [error, (error as { cause?: unknown })?.cause]) {
    if (c && typeof c === "object" && "code" in c) {
      const e = c as { code?: unknown; constraint?: unknown };
      return { code: typeof e.code === "string" ? e.code : undefined, constraint: typeof e.constraint === "string" ? e.constraint : undefined };
    }
  }
  return {};
}

export function isActivePhoneConflict(error: unknown): boolean {
  const e = pgError(error);
  return e.code === "23505" && e.constraint === "slot_bookings_active_phone_uq";
}

/** The slot starts after `now` (venue time): bookings close when it starts. */
export function upcomingCondition(now: Date): SQL {
  const n = venueNow(now);
  return or(gt(bookingSlots.date, n.date), and(eq(bookingSlots.date, n.date), gt(bookingSlots.startTime, n.time)))!;
}

export function slotState(slot: Pick<SlotRow, "status" | "date" | "startTime" | "capacity" | "bookedSeats">, now: Date): PublicSlotView["state"] {
  if (slot.status === "cancelled") return "cancelled";
  if (!isSlotUpcoming(slot, now)) return "past";
  if (slot.status === "closed") return "closed";
  return seatsLeft(slot) <= 0 ? "full" : "open";
}

/** Only what the public may see (never cancellation reasons, creators or counts of other people). */
export function toPublicSlot(slot: SlotRow, course: CourseRef, now: Date): PublicSlotView {
  return {
    code: slot.code,
    kind: slot.kind,
    title: slot.title,
    trade: slot.trade,
    courseTitle: course?.title ?? null,
    courseSlug: course?.slug ?? null,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    venue: slot.venue,
    instructions: slot.instructions,
    feeNote: slot.feeNote,
    seatsLeft: seatsLeft(slot),
    state: slotState(slot, now),
  };
}
