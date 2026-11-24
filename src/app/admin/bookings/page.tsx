import { CalendarPlus, CalendarRange, Share2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { absoluteUrl } from "@/lib/env";
import { parsePage, type SearchParams } from "@/lib/http";
import { listSlotsForStaff, upcomingSlotSummary, type StaffSlotListItem } from "@/modules/bookings/queries";
import { formatSlotDate, formatTimeRange, whatsappShareHref } from "@/modules/bookings/rules";
import { BOOKING_KIND_LABELS, BOOKINGS_ADMIN_PATH, BOOKINGS_PERMISSION, SLOT_STATUS_LABELS, SLOT_STATUS_TONE, staffSlotFiltersSchema } from "@/modules/bookings/schemas";
import { requireStaff } from "@/modules/identity/authz";

import { SeatsMeter } from "./_components/seats-meter";

export const metadata: Metadata = { title: "Bookings" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusBadge(s: StaffSlotListItem) {
  if (s.status === "open" && s.state === "past") return <StatusBadge tone="neutral" size="sm">Started</StatusBadge>;
  if (s.status === "open" && s.state === "full") return <StatusBadge tone="warning" size="sm">Full</StatusBadge>;
  return (
    <StatusBadge tone={SLOT_STATUS_TONE[s.status]} size="sm">
      {SLOT_STATUS_LABELS[s.status]}
    </StatusBadge>
  );
}

/** Trade test and training dates: upcoming first (today on), or past. Each opens the date's bookings. */
export default async function BookingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const sp = await searchParams;
  const filters = staffSlotFiltersSchema.parse({ when: first(sp.when) });
  const page = parsePage(sp, { defaultSize: 25 });
  const [result, summary] = await Promise.all([listSlotsForStaff(ctx, filters, page), upcomingSlotSummary(ctx)]);
  const shareText = `Book your trade test or training seat at Venkat Sai (Autonagar, Gajuwaka, Visakhapatnam): ${absoluteUrl("/book")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade test and training bookings"
        description="Open a date with a number of seats. Workers, travel agencies and companies book on the website; you see who is coming, mark attendance and print the sheet."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link href={`${BOOKINGS_ADMIN_PATH}/new`} data-testid="new-slot">
                <CalendarPlus aria-hidden="true" />
                New date
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <a href={whatsappShareHref(shareText)} target="_blank" rel="noopener noreferrer">
                <Share2 aria-hidden="true" />
                Share booking page on WhatsApp
              </a>
            </Button>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground" data-testid="slot-summary">
        Open for booking now: <strong className="font-semibold text-foreground tabular-nums">{summary.openSlots}</strong> {summary.openSlots === 1 ? "date" : "dates"},{" "}
        <strong className="font-semibold text-foreground tabular-nums">{summary.bookedSeats}</strong> seats booked,{" "}
        <strong className="font-semibold text-foreground tabular-nums">{summary.freeSeats}</strong> free.
      </p>

      <LinkTabs
        label="Which dates"
        items={[
          { href: BOOKINGS_ADMIN_PATH, label: "Upcoming" },
          { href: `${BOOKINGS_ADMIN_PATH}?when=past`, label: "Past" },
        ]}
      />

      <DataTable
        caption={filters.when === "past" ? "Past dates" : "Upcoming dates"}
        rows={result.items}
        getRowId={(s) => s.id}
        rowLink={(s) => ({ href: `${BOOKINGS_ADMIN_PATH}/${s.id}`, label: `Open ${s.title} on ${formatSlotDate(s.date)}` })}
        columns={[
          {
            id: "slot",
            header: "Date",
            primary: true,
            cell: (s) => (
              <div className="min-w-0" data-testid="slot-row">
                <p className="font-medium text-navy">{s.title}</p>
                <p className="text-sm text-foreground">
                  {formatSlotDate(s.date, "short")}, {formatTimeRange(s.startTime, s.endTime)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {BOOKING_KIND_LABELS[s.kind]} · {s.code}
                </p>
              </div>
            ),
          },
          { id: "trade", header: "Trade", cell: (s) => s.trade },
          { id: "seats", header: "Seats", cell: (s) => <SeatsMeter booked={s.bookedSeats} capacity={s.capacity} /> },
          { id: "people", header: "Bookings", hideOnMobile: true, align: "right", cell: (s) => <span className="tabular-nums">{s.activeBookings}</span> },
          { id: "status", header: "Status", cell: (s) => statusBadge(s) },
        ]}
        empty={
          <EmptyState
            icon={<CalendarRange />}
            title={filters.when === "past" ? "No past dates yet" : "No upcoming dates"}
            description={filters.when === "past" ? "Dates appear here after their day has passed." : "Open a trade test or training date. It appears on the website at /book straight away."}
            primaryAction={filters.when === "past" ? undefined : { label: "New date", href: `${BOOKINGS_ADMIN_PATH}/new` }}
          />
        }
        footer={<Pagination pathname={BOOKINGS_ADMIN_PATH} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="dates" />}
      />
    </div>
  );
}
