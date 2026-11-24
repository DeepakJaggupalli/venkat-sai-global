import { ArrowRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";

import { WhatsAppIcon } from "@/components/public/contact-links";
import { whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";
import { formatSlotDate, formatTimeRange, seatsLeftLabel } from "@/modules/bookings/rules";
import { BOOKING_KIND_LABELS, type PublicSlotView } from "@/modules/bookings/schemas";

/**
 * One date on the public /book list. An open slot is a single large link to its booking form; a full slot is not a
 * link and offers WhatsApp instead (ask about the next date).
 */
export function SlotCard({ slot }: { slot: PublicSlotView }) {
  const full = slot.state !== "open";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="label-dot">{BOOKING_KIND_LABELS[slot.kind]}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
            full ? "bg-surface-subtle text-muted-foreground" : slot.seatsLeft <= 3 ? "bg-warning-soft text-warning-strong" : "bg-teal-soft text-teal-strong",
          )}
          data-testid="slot-seats"
        >
          {seatsLeftLabel(slot.seatsLeft)}
        </span>
      </div>
      <h3 className="mt-3 font-heading text-xl font-bold text-balance text-foreground">{slot.title}</h3>
      <p className="mt-1 text-base text-muted-foreground">{slot.trade}</p>
      <ul className="mt-4 space-y-2 text-base text-foreground">
        <li className="flex items-start gap-2">
          <Clock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{formatTimeRange(slot.startTime, slot.endTime)}</span>
        </li>
        <li className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="line-clamp-2">{slot.venue}</span>
        </li>
      </ul>
    </>
  );

  if (full) {
    const message = `Hello Venkat Sai, ${slot.title} on ${formatSlotDate(slot.date)} is full. When is the next date?`;
    return (
      <li className="card-surface rounded-3xl p-5 sm:p-6" data-testid="slot-card" data-state={slot.state}>
        {body}
        <a
          href={whatsappHref(message)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-5 text-[15px] font-semibold text-foreground hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
        >
          <WhatsAppIcon className="text-green-strong" />
          Ask about the next date
          <span className="sr-only"> (opens WhatsApp)</span>
        </a>
      </li>
    );
  }

  return (
    <li data-testid="slot-card" data-state={slot.state}>
      <Link
        href={`/book/${slot.code}`}
        className="group card-surface block rounded-3xl p-5 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-6"
      >
        {body}
        <span className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-white group-hover:bg-[#26262b] sm:w-auto">
          Book a seat
          <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}
