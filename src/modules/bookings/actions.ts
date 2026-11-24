"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { requireStaff } from "@/modules/identity/authz";
import { getCurrentUser } from "@/modules/identity/session";

import {
  BOOK_PUBLIC_PATH,
  BOOKINGS_ADMIN_PATH,
  BOOKINGS_PERMISSION,
  bookingRequestSchema,
  bookingSlotSchema,
  bookingStatusSchema,
  slotCancelSchema,
  staffBookingSchema,
  type BookingResult,
} from "./schemas";
import { bookSlot, cancelSlot, createSlot, createStaffBooking, setBookingStatus, setSlotOpen, updateSlot } from "./service";

/** Public: book seats on a slot (/book/<code>). Consent, honeypot and rate limits are enforced by the service. */
export const bookSlotAction = createFormAction<typeof bookingRequestSchema, BookingResult>(bookingRequestSchema, async (input) => {
  const [meta, user] = await Promise.all([getRequestMeta(), getCurrentUser().catch(() => null)]);
  const result = await bookSlot(input, { ipHash: meta.ipHash, userId: user?.id ?? null });
  revalidatePath(BOOK_PUBLIC_PATH);
  revalidatePath(`${BOOK_PUBLIC_PATH}/${input.slotCode}`);
  return ok(result, result.existing ? "You already have a booking for this date." : "Your seat is booked.");
});

function revalidateSlot(id: string): void {
  revalidatePath(BOOKINGS_ADMIN_PATH);
  revalidatePath(`${BOOKINGS_ADMIN_PATH}/${id}`);
  revalidatePath(BOOK_PUBLIC_PATH);
}

/** Create a slot (then open its page) or save changes to one. */
export const saveSlotAction = createFormAction(bookingSlotSchema, async (input) => {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  if (input.id) {
    const result = await updateSlot(ctx, { ...input, id: input.id });
    revalidateSlot(result.id);
    redirect(`${BOOKINGS_ADMIN_PATH}/${result.id}${result.scheduleChanged && result.activeBookings > 0 ? "?changed=1" : ""}`);
  }
  const created = await createSlot(ctx, input);
  revalidateSlot(created.id);
  redirect(`${BOOKINGS_ADMIN_PATH}/${created.id}?created=1`);
});

/** Close a slot to new bookings, or open it again. */
export const setSlotOpenAction = createAction(z.object({ id: z.uuid(), open: z.boolean() }), async (input) => {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  await setSlotOpen(ctx, input);
  revalidateSlot(input.id);
  return ok(undefined, input.open ? "Open for booking again." : "Closed. No new bookings.");
});

/** Cancel a slot with a reason (its bookings are cancelled; the page lists the people to tell). */
export const cancelSlotAction = createFormAction(slotCancelSchema, async (input) => {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const { toInform } = await cancelSlot(ctx, input);
  revalidateSlot(input.id);
  return ok({ toInform }, toInform ? `Slot cancelled. Tell the ${toInform === 1 ? "person" : `${toInform} people`} who booked.` : "Slot cancelled.");
});

/** Attended / did not come / cancelled / booked again. */
export const setBookingStatusAction = createAction(bookingStatusSchema, async (input) => {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const { slotId, changed } = await setBookingStatus(ctx, input);
  revalidateSlot(slotId);
  return ok(undefined, changed ? "Booking updated." : "No change.");
});

/** Staff add a booking for someone who phoned or walked in. */
export const addStaffBookingAction = createFormAction(staffBookingSchema, async (input) => {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const booking = await createStaffBooking(ctx, input);
  revalidateSlot(booking.slotId);
  return ok({ code: booking.code }, `Booked: ${booking.code}.`);
});
