"use client";

import { Ban, CalendarCheck2, CalendarX2, Check, Lock, RotateCcw, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SlotBookingStatus } from "@/db/schema/bookings";
import type { ActionResult } from "@/lib/actions";
import { addStaffBookingAction, cancelSlotAction, setBookingStatusAction, setSlotOpenAction } from "@/modules/bookings/actions";
import { MAX_SEATS_PER_BOOKING } from "@/modules/bookings/schemas";

const INPUT = "h-12 text-base";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>) => {
    if (pending) return;
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "Done");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };
  return { pending, run };
}

/** Close the date to new bookings, or open it again. */
export function OpenCloseButton({ id, open }: { id: string; open: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button type="button" variant="outline" className="min-h-11" aria-disabled={pending || undefined} onClick={() => run(() => setSlotOpenAction({ id, open: !open }))} data-testid="slot-open-close">
      {open ? <Lock aria-hidden="true" /> : <CalendarCheck2 aria-hidden="true" />}
      {pending ? "Saving…" : open ? "Close for booking" : "Open for booking again"}
    </Button>
  );
}

/** Cancel the whole date with a reason. Every booking on it is cancelled; the page then lists the people to tell. */
export function CancelSlotDialog({ id, title, activeCount }: { id: string; title: string; activeCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(cancelSlotAction, null);
  useActionToast(state, {
    successMessage: "Slot cancelled.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={`Cancel ${title}?`}
      description={
        activeCount
          ? `${activeCount} ${activeCount === 1 ? "booking is" : "bookings are"} cancelled with it. Next you see each person with a WhatsApp button to tell them.`
          : "Nobody has booked this date yet. It disappears from the website."
      }
      trigger={
        <Button type="button" variant="destructive" className="min-h-11" data-testid="slot-cancel">
          <CalendarX2 aria-hidden="true" />
          Cancel date
        </Button>
      }
    >
      <form action={formAction} onResetCapture={keepFormValues} noValidate className="space-y-4">
        <FormErrorAlert state={state} />
        <input type="hidden" name="id" value={id} />
        <FormField label="Reason" name="reason" required state={state} hint="Staff only. You can copy it into the WhatsApp messages.">
          <Textarea rows={3} maxLength={300} placeholder="For example: Examiner not available. New date next week." className="text-base" />
        </FormField>
        <SubmitButton variant="destructive" pendingLabel="Cancelling…" className="min-h-12 w-full sm:w-auto">
          Cancel this date
        </SubmitButton>
      </form>
    </ResponsiveDialog>
  );
}

/** Attended / did not come / cancel / restore buttons of one booking (big enough to tap on a phone). */
export function BookingStatusControls({ id, name, status, locked }: { id: string; name: string; status: SlotBookingStatus; locked: boolean }) {
  const router = useRouter();
  const { pending, run } = useRun();
  if (locked) return null;
  const set = (next: SlotBookingStatus) => () => run(() => setBookingStatusAction({ id, status: next }));
  if (status === "cancelled") {
    return (
      <Button type="button" variant="outline" className="min-h-11" aria-disabled={pending || undefined} onClick={set("booked")}>
        <RotateCcw aria-hidden="true" />
        Book again
        <span className="sr-only"> for {name}</span>
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" data-testid="booking-status-controls">
      {status !== "attended" ? (
        <Button type="button" variant="outline" className="min-h-11" aria-disabled={pending || undefined} onClick={set("attended")}>
          <Check aria-hidden="true" />
          Came
          <span className="sr-only"> ({name})</span>
        </Button>
      ) : null}
      {status !== "no_show" ? (
        <Button type="button" variant="outline" className="min-h-11" aria-disabled={pending || undefined} onClick={set("no_show")}>
          <X aria-hidden="true" />
          Did not come
          <span className="sr-only"> ({name})</span>
        </Button>
      ) : null}
      {status !== "booked" ? (
        <Button type="button" variant="ghost" className="min-h-11" aria-disabled={pending || undefined} onClick={set("booked")}>
          <RotateCcw aria-hidden="true" />
          Undo
          <span className="sr-only"> ({name})</span>
        </Button>
      ) : null}
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" className="min-h-11 text-danger-strong">
            <Ban aria-hidden="true" />
            Cancel
            <span className="sr-only"> booking of {name}</span>
          </Button>
        }
        title={`Cancel the booking of ${name}?`}
        description="The seats become free for others. You can book them again later if seats are still free."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        variant="destructive"
        onConfirm={() => setBookingStatusAction({ id, status: "cancelled" })}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

/** Staff add a booking for someone who phoned or walked in. */
export function AddBookingDialog({ slotId, defaultTrade, seatsLeft }: { slotId: string; defaultTrade: string; seatsLeft: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addStaffBookingAction, null);
  const maxSeats = Math.max(1, Math.min(MAX_SEATS_PER_BOOKING, seatsLeft));
  useActionToast(state, {
    successMessage: "Booked.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title="Add a booking"
      description="For someone who phoned or came to the office."
      trigger={
        <Button type="button" className="min-h-11" disabled={seatsLeft <= 0} data-testid="add-booking">
          <UserPlus aria-hidden="true" />
          Add a booking
        </Button>
      }
    >
      <form action={formAction} onResetCapture={keepFormValues} noValidate className="space-y-4">
        <FormErrorAlert state={state} />
        <input type="hidden" name="slotId" value={slotId} />
        <FormField label="Name" name="name" required state={state}>
          <Input autoComplete="off" maxLength={120} className={INPUT} />
        </FormField>
        <FormField label="Mobile / WhatsApp number" name="phone" required state={state}>
          <Input type="tel" inputMode="tel" autoComplete="off" maxLength={20} placeholder="98765 43210" className={INPUT} />
        </FormField>
        <FormField label="Trade" name="trade" required state={state}>
          <Input defaultValue={defaultTrade} maxLength={80} className={INPUT} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <FormField label="Company or travel agency" name="organizationName" optional state={state}>
            <Input maxLength={160} className={INPUT} />
          </FormField>
          <FormField label="Seats" name="seats" required state={state} hint={`Up to ${maxSeats}`}>
            <Input type="number" inputMode="numeric" min={1} max={maxSeats} step={1} defaultValue={1} className={INPUT} />
          </FormField>
        </div>
        <FormField label="Notes (staff only)" name="notes" optional state={state}>
          <Textarea rows={2} maxLength={1000} className="text-base" />
        </FormField>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
          <input type="checkbox" name="consentToContact" value="true" className="mt-0.5 size-5 shrink-0 accent-[var(--brand-navy)]" />
          <span>The person agreed that we may call or WhatsApp them about this booking.</span>
        </label>
        {state && !state.ok && state.fieldErrors?.consentToContact ? <p className="text-sm font-medium text-danger-strong">{state.fieldErrors.consentToContact[0]}</p> : null}
        <SubmitButton pendingLabel="Booking…" className="min-h-12 w-full sm:w-auto">
          Book
        </SubmitButton>
      </form>
    </ResponsiveDialog>
  );
}
