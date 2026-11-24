"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ConsentCheckbox, Honeypot } from "@/components/public/forms/form-parts";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { Input } from "@/components/ui/input";
import { bookSlotAction } from "@/modules/bookings/actions";
import { seatsLabel } from "@/modules/bookings/rules";
import { MAX_SEATS_PER_BOOKING, type PublicSlotView } from "@/modules/bookings/schemas";

import { BookingConfirmation } from "./booking-confirmation";

const INPUT = "h-12 text-base";

/**
 * The short booking form: name, mobile, trade (prefilled with the slot's trade), optional email, and "Booking for a
 * company or travel agency?" which adds the organisation name and the number of seats. Consent is required.
 */
export function BookingForm({ slot }: { slot: PublicSlotView }) {
  const [state, formAction] = useActionState(bookSlotAction, null);
  const [forOrganization, setForOrganization] = useState(false);
  const maxSeats = Math.max(1, Math.min(MAX_SEATS_PER_BOOKING, slot.seatsLeft));

  if (state?.ok && state.data) return <BookingConfirmation result={state.data} />;

  return (
    <form
      action={formAction}
      onResetCapture={keepFormValues}
      noValidate
      aria-labelledby="book-form-heading"
      className="card-surface relative space-y-5 rounded-3xl p-5 sm:p-8"
      data-testid="book-form"
    >
      <div>
        <h2 id="book-form-heading" className="font-heading text-xl font-bold text-foreground sm:text-2xl">
          Book your seat
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">It takes one minute. Fields marked * are required.</p>
      </div>
      <FormErrorAlert state={state} title="We could not book your seat" />
      <Honeypot />
      <input type="hidden" name="slot" value={slot.code} />

      <FormField label="Full name" name="name" required state={state}>
        <Input autoComplete="name" maxLength={120} className={INPUT} />
      </FormField>

      <FormField label="Mobile / WhatsApp number" name="phone" required state={state} hint="Include the country code if your number is not Indian, for example +971.">
        <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98765 43210" className={INPUT} />
      </FormField>

      <FormField label="Your trade" name="trade" required state={state}>
        <Input defaultValue={slot.trade} maxLength={80} autoComplete="organization-title" className={INPUT} />
      </FormField>

      <FormField label="Email" name="email" optional state={state}>
        <Input type="email" inputMode="email" autoComplete="email" spellCheck={false} maxLength={254} className={INPUT} />
      </FormField>

      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-input px-4 py-2 has-checked:border-foreground has-checked:bg-surface-subtle">
        <input
          type="checkbox"
          name="forOrganization"
          value="true"
          checked={forOrganization}
          onChange={(event) => setForOrganization(event.target.checked)}
          className="size-5 shrink-0 accent-[var(--brand-navy)]"
          data-testid="for-organization"
        />
        <span className="text-base font-medium text-foreground">Booking for a company or travel agency?</span>
      </label>

      {forOrganization ? (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <FormField label="Company or travel agency name" name="organizationName" required state={state}>
            <Input autoComplete="organization" maxLength={160} className={INPUT} />
          </FormField>
          <FormField label="Number of seats" name="seats" required state={state} hint={`Up to ${seatsLabel(maxSeats)}`}>
            <Input type="number" inputMode="numeric" min={1} max={maxSeats} step={1} defaultValue={1} className={INPUT} />
          </FormField>
        </div>
      ) : null}

      <ConsentCheckbox state={state} label="I agree that Venkat Sai Global may call or WhatsApp me about this booking." />

      <SubmitButton pendingLabel="Booking…" className="min-h-12 w-full rounded-full bg-foreground px-6 text-base font-semibold text-white hover:bg-[#26262b] sm:w-auto">
        {forOrganization ? "Book the seats" : "Book my seat"}
      </SubmitButton>
      <p className="text-sm text-muted-foreground">
        Venkat Sai never charges candidates to apply for a job.{" "}
        <Link href="/safe-recruitment" className="font-medium text-teal-strong underline underline-offset-4">
          How to stay safe
        </Link>
      </p>
    </form>
  );
}
