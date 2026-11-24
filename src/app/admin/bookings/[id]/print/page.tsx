import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CONTACT } from "@/config/contact";
import { formatExportDateTime } from "@/lib/xlsx-export";
import { getSlotForStaff, type StaffBookingItem } from "@/modules/bookings/queries";
import { formatSlotDate, formatTimeRange } from "@/modules/bookings/rules";
import { BOOKING_KIND_LABELS, BOOKINGS_ADMIN_PATH, BOOKINGS_PERMISSION } from "@/modules/bookings/schemas";
import { requireStaff } from "@/modules/identity/authz";

import { PrintSheetButton } from "../../_components/print-sheet-button";

export const metadata: Metadata = { title: "Attendance sheet" };

/** Only the sheet is printed (the Command Centre shell and these controls are hidden on paper). */
const PRINT_CSS = `@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  #attendance-sheet, #attendance-sheet * { visibility: visible !important; }
  #attendance-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
  #attendance-sheet tr { break-inside: avoid; }
}`;

/** Spare lines at the end of the sheet for people who walk in without a booking. */
const WALK_IN_ROWS = 5;

type SheetRow = { name: string; phone: string; trade: string; organisation: string; booking: string };

/**
 * One line per seat: an individual's line carries their name; a travel agency or company booking gets one blank line
 * per seat (each worker writes their name and signs), with the contact person shown next to the agency name.
 */
function sheetRows(bookings: StaffBookingItem[]): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const phone = b.phone ?? b.phoneMasked;
    for (let seat = 1; seat <= b.seats; seat++) {
      const firstLine = seat === 1;
      rows.push({
        name: b.organizationName ? "" : b.name,
        phone: firstLine ? phone : "",
        trade: b.trade,
        organisation: b.organizationName ? (firstLine ? `${b.organizationName} (contact: ${b.name})` : b.organizationName) : "",
        booking: b.seats > 1 ? `${b.code} (${seat} of ${b.seats})` : b.code,
      });
    }
  }
  return rows;
}

const CELL = "border border-[#9ca3af] px-2 py-1.5 align-top";

/** Printable attendance sheet of one date, with a signature column. */
export default async function AttendanceSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const { id } = await params;
  const detail = await getSlotForStaff(ctx, id, { reason: "Attendance sheet (printed)" });
  if (!detail) notFound();
  const { slot } = detail;
  const rows = sheetRows(detail.bookings);

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`${BOOKINGS_ADMIN_PATH}/${slot.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {slot.title}
        </Link>
        <PrintSheetButton />
      </div>
      <p className="text-sm text-muted-foreground print:hidden">Only the sheet below is printed. On a phone, choose Print, then Save as PDF to share it.</p>

      <article id="attendance-sheet" className="overflow-x-auto rounded-xl border border-border bg-white p-4 text-[13px] text-black sm:p-8" aria-labelledby="sheet-title">
        <header className="border-b-2 border-black pb-3">
          <p className="text-lg font-bold">{CONTACT.businessName}</p>
          <p className="text-xs">
            {CONTACT.address.oneLine} · Phone / WhatsApp +91 {CONTACT.whatsapp.display}
          </p>
        </header>
        <h1 id="sheet-title" className="mt-4 text-xl font-bold">
          Attendance sheet
        </h1>
        <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="font-semibold">{BOOKING_KIND_LABELS[slot.kind]}:</dt>
            <dd>{slot.title}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Trade:</dt>
            <dd>{slot.trade}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Date:</dt>
            <dd>{formatSlotDate(slot.date)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Time:</dt>
            <dd>{formatTimeRange(slot.startTime, slot.endTime)}</dd>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <dt className="font-semibold">Place:</dt>
            <dd>{slot.venue}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Reference:</dt>
            <dd>{slot.code}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Seats booked:</dt>
            <dd className="tabular-nums">
              {slot.bookedSeats} of {slot.capacity}
            </dd>
          </div>
        </dl>
        {slot.status === "cancelled" ? <p className="mt-3 font-semibold">This date was cancelled.</p> : null}

        <table className="mt-5 w-full min-w-[640px] border-collapse">
          <caption className="sr-only">People booked, one line per seat, with a signature column</caption>
          <thead>
            <tr className="bg-[#f3f4f6]">
              <th scope="col" className={`${CELL} w-10 text-left`}>
                S.No
              </th>
              <th scope="col" className={`${CELL} text-left`}>
                Name
              </th>
              <th scope="col" className={`${CELL} text-left`}>
                Mobile
              </th>
              <th scope="col" className={`${CELL} text-left`}>
                Trade
              </th>
              <th scope="col" className={`${CELL} text-left`}>
                Company / agency
              </th>
              <th scope="col" className={`${CELL} text-left`}>
                Booking
              </th>
              <th scope="col" className={`${CELL} w-36 text-left`}>
                Signature
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.booking}-${i}`} className="h-10" data-testid="sheet-row">
                <td className={`${CELL} tabular-nums`}>{i + 1}</td>
                <td className={CELL}>{r.name}</td>
                <td className={`${CELL} tabular-nums whitespace-nowrap`}>{r.phone}</td>
                <td className={CELL}>{r.trade}</td>
                <td className={CELL}>{r.organisation}</td>
                <td className={`${CELL} whitespace-nowrap`}>{r.booking}</td>
                <td className={CELL} />
              </tr>
            ))}
            {Array.from({ length: WALK_IN_ROWS }, (_, k) => (
              <tr key={`walk-in-${k}`} className="h-10">
                <td className={`${CELL} tabular-nums`}>{rows.length + k + 1}</td>
                <td className={CELL} />
                <td className={CELL} />
                <td className={CELL} />
                <td className={CELL} />
                <td className={CELL}>{k === 0 ? "Walk-in" : ""}</td>
                <td className={CELL} />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <p>Checked by: ______________________</p>
          <p>Signature: ______________________</p>
          <p>Date: ______________________</p>
        </div>
        <p className="mt-6 text-[11px] text-[#4b5563]">Printed {formatExportDateTime(new Date())} (India time). Personal data: keep this sheet safe and destroy it when no longer needed.</p>
      </article>
    </div>
  );
}
