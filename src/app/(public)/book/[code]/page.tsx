import { CalendarX2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/public/page-hero";
import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { buildPageMetadata, settle } from "@/components/public/server";
import { getPublicSlot } from "@/modules/bookings/queries";
import { formatSlotDate, formatTimeRange } from "@/modules/bookings/rules";
import { BOOKING_KIND_LABELS, SLOT_CODE_PATTERN, type PublicSlotView } from "@/modules/bookings/schemas";

import { BookingForm } from "../_components/booking-form";
import { SlotFacts } from "../_components/slot-facts";

type PageProps = { params: Promise<{ code: string }> };

async function loadSlot(raw: string): Promise<PublicSlotView | null> {
  const code = raw.trim().toUpperCase();
  if (!SLOT_CODE_PATTERN.test(code)) return null;
  return settle("booking_slot", () => getPublicSlot(code), null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slot = await loadSlot((await params).code);
  if (!slot) return { title: "Date not found", robots: { index: false } };
  // Dated pages expire quickly: shareable on WhatsApp, kept out of search results (the /book list is indexed).
  return buildPageMetadata({
    title: `Book: ${slot.title}, ${formatSlotDate(slot.date, "short")}`,
    description: `${BOOKING_KIND_LABELS[slot.kind]} at Venkat Sai on ${formatSlotDate(slot.date)}, ${formatTimeRange(slot.startTime, slot.endTime)}. Book your seat in one minute.`,
    path: `/book/${slot.code}`,
    noindex: true,
  });
}

const CLOSED_COPY: Record<Exclude<PublicSlotView["state"], "open">, { title: string; text: string }> = {
  full: { title: "This date is full", text: "All seats on this date are booked. Choose another date, or ask us on WhatsApp about the next one." },
  closed: { title: "Booking for this date is closed", text: "We are not taking more bookings for this date. Choose another date, or ask us on WhatsApp." },
  cancelled: { title: "This date was cancelled", text: "If you booked, our team will contact you. Choose another date, or ask us on WhatsApp." },
  past: { title: "This date has passed", text: "Choose another date, or ask us on WhatsApp about the next one." },
};

/** One date: what, when and where, then the booking form (or why it cannot be booked, with a way forward). */
export default async function BookSlotPage({ params }: PageProps) {
  const slot = await loadSlot((await params).code);
  if (!slot) notFound();
  const kindLabel = BOOKING_KIND_LABELS[slot.kind];
  const closed = slot.state === "open" ? null : CLOSED_COPY[slot.state];

  return (
    <>
      <PageHero
        eyebrow={kindLabel}
        title={slot.title}
        intro={`${formatSlotDate(slot.date)}, ${formatTimeRange(slot.startTime, slot.endTime)}`}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Book a seat", href: "/book" }, { label: slot.title }]}
      />
      <div className="container-page grid gap-8 pb-16 sm:pb-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-12">
        <aside aria-label="Date details" className="card-surface order-first h-fit rounded-3xl p-5 sm:p-6 lg:order-last">
          <SlotFacts slot={slot} />
        </aside>
        <div className="min-w-0">
          {closed ? (
            <section className="card-surface rounded-3xl p-6 sm:p-8" aria-labelledby="slot-closed" data-testid="slot-unavailable" data-state={slot.state}>
              <CalendarX2 className="size-10 text-muted-foreground" aria-hidden="true" />
              <h2 id="slot-closed" className="mt-4 font-heading text-2xl font-bold text-foreground">
                {closed.title}
              </h2>
              <p className="mt-2 text-base text-muted-foreground">{closed.text}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={`/book?kind=${slot.kind}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-foreground px-6 text-[15px] font-semibold text-white hover:bg-[#26262b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  See other dates
                </Link>
                <WhatsAppButton message={`Hello Venkat Sai, when is the next date for ${slot.title}?`} label="Ask on WhatsApp" />
                <CallButton />
              </div>
            </section>
          ) : (
            <BookingForm slot={slot} />
          )}
        </div>
      </div>
    </>
  );
}
