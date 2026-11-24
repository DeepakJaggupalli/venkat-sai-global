import { FileSpreadsheet, MessageCircle, Pencil, Phone, Printer, Share2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { CopyButton } from "@/components/shared/copy-button";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import { absoluteUrl } from "@/lib/env";
import { sp as pick, type SearchParams } from "@/lib/http";
import { getSlotForStaff, type StaffBookingItem } from "@/modules/bookings/queries";
import {
  cancelledWhatsAppMessage,
  changedWhatsAppMessage,
  formatSlotDate,
  formatTimeRange,
  personWhatsAppMessage,
  seatsLabel,
  shareSlotMessage,
  venueNow,
  whatsappShareHref,
} from "@/modules/bookings/rules";
import {
  BOOKING_KIND_LABELS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONE,
  BOOKINGS_ADMIN_PATH,
  BOOKINGS_PERMISSION,
  SLOT_STATUS_LABELS,
  SLOT_STATUS_TONE,
} from "@/modules/bookings/schemas";
import { requireStaff } from "@/modules/identity/authz";

import { SeatsMeter } from "../_components/seats-meter";
import { AddBookingDialog, BookingStatusControls, CancelSlotDialog, OpenCloseButton } from "../_components/slot-controls";

export const metadata: Metadata = { title: "Booking date" };

function ContactLinks({ booking, message }: { booking: StaffBookingItem; message: string }) {
  if (!booking.phone) return <span className="text-muted-foreground">{booking.phoneMasked}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`tel:${booking.phone}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-navy underline-offset-4 hover:underline">
        <Phone className="size-4" aria-hidden="true" />
        {booking.phone}
      </a>
      <a
        href={whatsappHref(message, booking.phone)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-success-strong hover:bg-success-soft"
        data-testid="booking-whatsapp"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        WhatsApp
        <span className="sr-only"> {booking.name}</span>
      </a>
    </div>
  );
}

/**
 * One date: summary, actions (print the attendance sheet, Excel, share, edit, close, cancel) and the people booked,
 * with call / WhatsApp and attendance buttons. After a cancellation the people to tell are listed first.
 */
export default async function SlotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await getSlotForStaff(ctx, id);
  if (!detail) notFound();
  const { slot, bookings } = detail;
  const cancelled = slot.status === "cancelled";
  const changed = pick(sp, "changed") === "1" && !cancelled;
  const created = pick(sp, "created") === "1";
  const words = { title: slot.title, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, venue: slot.venue, kind: slot.kind };
  const bookUrl = absoluteUrl(`/book/${slot.code}`);
  const shareHref = whatsappShareHref(shareSlotMessage({ slot: words, seatsLeft: detail.seatsLeft, url: bookUrl }));
  const toInform = bookings.filter((b) => b.cancelledWithSlot);
  const active = bookings.filter((b) => b.status !== "cancelled");
  const statusLabel = slot.status === "open" && detail.state === "full" ? "Full" : SLOT_STATUS_LABELS[slot.status];
  const messageFor = (b: StaffBookingItem) => (changed ? changedWhatsAppMessage({ name: b.name, code: b.code, slot: words }) : personWhatsAppMessage({ name: b.name, code: b.code, slot: words }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={slot.title}
        eyebrow={slot.code}
        backLink={{ href: BOOKINGS_ADMIN_PATH, label: "Bookings" }}
        status={
          <StatusBadge tone={detail.state === "full" && slot.status === "open" ? "warning" : SLOT_STATUS_TONE[slot.status]}>
            {statusLabel}
          </StatusBadge>
        }
        description={`${BOOKING_KIND_LABELS[slot.kind]} · ${formatSlotDate(slot.date)}, ${formatTimeRange(slot.startTime, slot.endTime)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link href={`${BOOKINGS_ADMIN_PATH}/${slot.id}/print`} data-testid="print-sheet">
                <Printer aria-hidden="true" />
                Print attendance sheet
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <a href={`${BOOKINGS_ADMIN_PATH}/${slot.id}/export`} rel="nofollow" data-testid="download-excel">
                <FileSpreadsheet aria-hidden="true" />
                Download Excel
              </a>
            </Button>
          </div>
        }
      />

      {created ? (
        <Callout tone="success" title="The date is open for booking" action={{ label: "Share on WhatsApp", href: shareHref, external: true }}>
          People can book at <span className="font-medium break-all">{bookUrl}</span>. Share it in your WhatsApp groups.
        </Callout>
      ) : null}
      {changed && active.length ? (
        <Callout tone="warning" title="Tell the people who booked">
          You changed the date, time or place. The WhatsApp button next to each person opens a message with the new details.
        </Callout>
      ) : null}

      {cancelled ? (
        <SectionCard
          title={toInform.length ? `Tell these ${toInform.length === 1 ? "person" : `${toInform.length} people`}` : "This date was cancelled"}
          description={`Cancelled${slot.cancelledAt ? ` on ${formatSlotDate(venueNow(slot.cancelledAt).date, "short")}` : ""}${detail.cancelledByName ? ` by ${detail.cancelledByName}` : ""}. Reason: ${slot.cancelReason ?? "not given"}.`}
          icon={<Users />}
        >
          {toInform.length ? (
            <ul className="divide-y divide-border" data-testid="people-to-inform">
              {toInform.map((b) => (
                <li key={b.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{b.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.code} · {seatsLabel(b.seats)}
                      {b.organizationName ? ` · ${b.organizationName}` : ""}
                    </p>
                  </div>
                  <ContactLinks booking={b} message={cancelledWhatsAppMessage({ name: b.name, code: b.code, reason: slot.cancelReason, slot: words })} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody had booked this date.</p>
          )}
          {!detail.canContact && toInform.length ? <p className="mt-3 text-sm text-muted-foreground">Phone numbers are hidden: they need the permission to view candidate contact details.</p> : null}
        </SectionCard>
      ) : null}

      <SectionCard title="Seats" headingLevel="h2">
        <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-center">
          <SeatsMeter booked={slot.bookedSeats} capacity={slot.capacity} />
          {!cancelled ? (
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button asChild variant="outline" className="min-h-11">
                <a href={shareHref} target="_blank" rel="noopener noreferrer" data-testid="share-slot">
                  <Share2 aria-hidden="true" />
                  Share on WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`${BOOKINGS_ADMIN_PATH}/${slot.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
              <OpenCloseButton id={slot.id} open={slot.status === "open"} />
              <CancelSlotDialog id={slot.id} title={slot.title} activeCount={bookings.filter((b) => b.status === "booked").length} />
            </div>
          ) : null}
        </div>
        <details className="group mt-4 border-t border-border pt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground underline-offset-4 hover:underline">Place, what to bring and booking link</summary>
          <div className="space-y-4 pt-2">
            <KeyValueList
              items={[
                { label: "Place", value: slot.venue },
                { label: "Trade", value: slot.trade },
                { label: "Course", value: detail.courseTitle },
                { label: "What to bring", value: slot.instructions },
                { label: "Fees", value: slot.feeNote },
                { label: "Opened by", value: detail.createdByName },
              ].filter((item) => item.value)}
            />
            {!cancelled ? (
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-sm text-muted-foreground" translate="no">
                  {bookUrl}
                </span>
                <CopyButton value={bookUrl} label="booking link" />
              </div>
            ) : null}
          </div>
        </details>
      </SectionCard>

      <SectionCard
        title={`People booked (${active.length})`}
        description={active.length ? `${seatsLabel(slot.bookedSeats)} taken, ${detail.seatsLeft} free.` : undefined}
        action={!cancelled ? <AddBookingDialog slotId={slot.id} defaultTrade={slot.trade} seatsLeft={detail.seatsLeft} /> : undefined}
        flush
      >
        {!detail.canContact && bookings.length ? <p className="px-5 pt-4 text-sm text-muted-foreground">Phone numbers are hidden: they need the permission to view candidate contact details.</p> : null}
        <DataTable
          caption="People booked on this date"
          rows={bookings}
          getRowId={(b) => b.id}
          columns={[
            { id: "sno", header: "S.No", hideOnMobile: true, nowrap: true, cell: (_b, i) => <span className="tabular-nums">{i + 1}</span> },
            {
              id: "name",
              header: "Name",
              primary: true,
              cell: (b, i) => (
                <div className="min-w-0" data-testid="booking-row">
                  <p className="font-medium text-foreground">
                    <span className="tabular-nums md:hidden">{i + 1}. </span>
                    {b.name}
                  </p>
                  {b.source === "staff" ? <p className="text-xs text-muted-foreground">Added by staff</p> : null}
                  {b.notes ? <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p> : null}
                </div>
              ),
            },
            { id: "phone", header: "Phone", cell: (b) => <ContactLinks booking={b} message={messageFor(b)} /> },
            { id: "trade", header: "Trade", cell: (b) => b.trade },
            { id: "org", header: "Company / agency", cell: (b) => b.organizationName ?? <span className="text-muted-foreground">Individual</span> },
            { id: "seats", header: "Seats", align: "right", cell: (b) => <span className="tabular-nums">{b.seats}</span> },
            {
              id: "status",
              header: "Status",
              cell: (b) => (
                <StatusBadge tone={BOOKING_STATUS_TONE[b.status]} size="sm">
                  {BOOKING_STATUS_LABELS[b.status]}
                </StatusBadge>
              ),
            },
            {
              id: "code",
              header: "Code",
              nowrap: true,
              cell: (b) => (
                <span className="text-sm tabular-nums" translate="no">
                  {b.code}
                </span>
              ),
            },
            {
              id: "actions",
              header: "Attendance",
              cell: (b) => <BookingStatusControls id={b.id} name={b.name} status={b.status} locked={cancelled} />,
            },
          ]}
          empty={
            <EmptyState
              icon={<Users />}
              title="Nobody has booked yet"
              description={cancelled ? "This date was cancelled." : "Share the booking link on WhatsApp, or add a booking for someone who phoned."}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
