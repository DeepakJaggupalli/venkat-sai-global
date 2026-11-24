"use client";

import { CalendarPlus, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { CallButton, CONTACT_BUTTON_STYLES, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { cn } from "@/lib/utils";
import { officeWhatsAppMessage } from "@/modules/bookings/rules";
import type { BookingResult } from "@/modules/bookings/schemas";

import { SlotFacts } from "./slot-facts";

/**
 * Shown after booking: the booking code, date / time / place, what to bring, WhatsApp to the office (prefilled with
 * the code), an "Add to calendar" file and a call button. A repeated booking from the same number shows the
 * booking that already exists.
 */
export function BookingConfirmation({ result }: { result: BookingResult }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const message = officeWhatsAppMessage({ code: result.code, existing: result.existing, name: result.name, seats: result.seats, organizationName: result.organizationName, slot: result.slot });
  const calendarHref = `/book/${encodeURIComponent(result.slot.code)}/calendar${result.code ? `?ref=${encodeURIComponent(result.code)}` : ""}`;
  // The number already holds a booking under another name: its details stay private (the office helps on WhatsApp).
  const otherName = result.existing && !result.code;

  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="rounded-3xl border border-success/40 bg-success-soft p-5 focus:outline-none sm:p-8" data-testid="book-confirmation">
      <CheckCircle2 className="size-10 text-success-strong" aria-hidden="true" />
      <h2 className="mt-4 font-heading text-2xl font-bold text-balance text-foreground">
        {otherName
          ? "This mobile number already has a booking for this date"
          : result.existing
            ? "You already have a booking for this date"
            : `Thank you${result.name ? `, ${result.name}` : ""}. Your ${result.seats > 1 ? "seats are" : "seat is"} booked.`}
      </h2>
      {otherName ? (
        <p className="mt-2 text-base text-foreground" data-testid="booking-other-name">
          No new seat was booked. For the booking code, or to change the booking, message us on WhatsApp from this number.
        </p>
      ) : null}
      {result.code ? (
        <div className="mt-4 rounded-2xl border border-border bg-white p-4">
          <p className="text-sm text-muted-foreground">Your booking code</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wide text-foreground tabular-nums" translate="no" data-testid="booking-code">
            {result.code}
          </p>
          <p className="mt-1 text-sm text-foreground">Keep it. Show it when you come, and quote it on WhatsApp.</p>
        </div>
      ) : null}
      <div className="mt-5 rounded-2xl border border-border bg-white p-4 sm:p-5">
        <p className="font-heading text-lg font-semibold text-foreground">{result.slot.title}</p>
        <div className="mt-3">
          <SlotFacts slot={result.slot} seats={otherName ? undefined : result.seats} showSeatsLeft={false} />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton message={message} label={otherName ? "Ask on WhatsApp" : "Send my booking on WhatsApp"} className="min-h-14 text-base" />
        <a href={calendarHref} className={cn(CONTACT_BUTTON_STYLES.outline, "min-h-14")} data-testid="add-to-calendar">
          <CalendarPlus aria-hidden="true" />
          Add to calendar
        </a>
        <CallButton label="Call us" className="min-h-14" />
      </div>
      <p className="mt-5 text-sm text-foreground">Need to change or cancel? Message us on WhatsApp with your booking code.</p>
      <Link href="/book" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-foreground underline underline-offset-4">
        See other dates
      </Link>
    </div>
  );
}
