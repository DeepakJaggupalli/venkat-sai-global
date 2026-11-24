import { CalendarDays, Clock, GraduationCap, HardHat, Info, MapPin, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CONTACT } from "@/config/contact";
import { formatSlotDate, formatTimeRange, seatsLabel, seatsLeftLabel } from "@/modules/bookings/rules";
import type { PublicSlotView } from "@/modules/bookings/schemas";

/** Google Maps for the venue: the business's own place link for the office, a search link for anywhere else. */
export function venueMapHref(venue: string): string {
  return venue.trim() === CONTACT.address.oneLine ? CONTACT.maps.shareUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="text-base font-medium break-words text-foreground">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Date, time, place, trade, course, seats, what to bring and any fee note of a slot (public data only). Used on the
 * slot page and in the booking confirmation; `seats` shows the seats booked instead of the seats left.
 */
export function SlotFacts({ slot, seats, showSeatsLeft = true }: { slot: PublicSlotView; seats?: number; showSeatsLeft?: boolean }) {
  return (
    <div className="space-y-5">
      <dl className="space-y-4">
        <Fact icon={<CalendarDays />} label="Date">
          {formatSlotDate(slot.date)}
        </Fact>
        <Fact icon={<Clock />} label="Time">
          {formatTimeRange(slot.startTime, slot.endTime)}
        </Fact>
        <Fact icon={<MapPin />} label="Place">
          <span className="block">{slot.venue}</span>
          <a href={venueMapHref(slot.venue)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-teal-strong underline underline-offset-4">
            Open in Maps
            <span className="sr-only"> (opens a new tab)</span>
          </a>
        </Fact>
        <Fact icon={<HardHat />} label="Trade">
          {slot.trade}
        </Fact>
        {slot.courseTitle && slot.courseSlug ? (
          <Fact icon={<GraduationCap />} label="Course">
            <Link href={`/training/${slot.courseSlug}`} className="underline underline-offset-4">
              {slot.courseTitle}
            </Link>
          </Fact>
        ) : null}
        {seats ? (
          <Fact icon={<Users />} label="Your booking">
            {seatsLabel(seats)}
          </Fact>
        ) : showSeatsLeft ? (
          <Fact icon={<Users />} label="Seats">
            <span className="tabular-nums">{seatsLeftLabel(slot.seatsLeft)}</span>
          </Fact>
        ) : null}
      </dl>
      {slot.instructions ? (
        <div className="rounded-2xl border border-border bg-surface-subtle p-4" data-testid="slot-instructions">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            What to bring
          </p>
          <p className="mt-1 text-base whitespace-pre-line text-foreground">{slot.instructions}</p>
        </div>
      ) : null}
      {slot.feeNote ? (
        <p className="text-sm text-foreground" data-testid="slot-fee-note">
          <span className="font-semibold">Fees: </span>
          {slot.feeNote}
        </p>
      ) : null}
    </div>
  );
}
