import type { NextRequest } from "next/server";

import { formatExportDateTime } from "@/lib/xlsx-export";
import { getSlotForStaff, type StaffBookingItem } from "@/modules/bookings/queries";
import { formatSlotDate, formatTimeRange } from "@/modules/bookings/rules";
import { BOOKING_KIND_LABELS, BOOKING_STATUS_LABELS, BOOKINGS_PERMISSION, SLOT_STATUS_LABELS } from "@/modules/bookings/schemas";
import { staffExport } from "@/modules/exports/http";

/**
 * GET /admin/bookings/[id]/export — Excel download of the people booked on one date (BOOKINGS_PERMISSION). Phone
 * numbers and emails in full only with candidates.view_contact (masked otherwise); the export is logged.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return staffExport<StaffBookingItem>({
    permission: BOOKINGS_PERMISSION,
    list: "slot_bookings",
    slug: "bookings",
    dataCategory: "contact",
    build: async (ctx) => {
      const detail = await getSlotForStaff(ctx, id, { log: false });
      if (!detail) return null;
      const { slot, bookings } = detail;
      return {
        title: `Bookings: ${slot.title} (${slot.code})`,
        filters: [
          BOOKING_KIND_LABELS[slot.kind],
          `${formatSlotDate(slot.date)}, ${formatTimeRange(slot.startTime, slot.endTime)}`,
          slot.venue,
          `${slot.bookedSeats} of ${slot.capacity} seats booked`,
          SLOT_STATUS_LABELS[slot.status],
        ],
        filterValues: { slotId: slot.id, slotCode: slot.code },
        rows: bookings,
        total: bookings.length,
        columns: [
          { header: "Name", value: (b) => b.name },
          { header: "Phone number", value: (b) => b.phone ?? b.phoneMasked },
          { header: "Trade", value: (b) => b.trade },
          { header: "Company / agency", value: (b) => b.organizationName ?? "" },
          { header: "Seats", value: (b) => b.seats },
          { header: "Status", value: (b) => BOOKING_STATUS_LABELS[b.status] },
          { header: "Booking code", value: (b) => b.code },
          { header: "Email", value: (b) => b.email ?? "" },
          { header: "Booked", value: (b) => formatExportDateTime(b.createdAt) },
          { header: "Booked by", value: (b) => (b.source === "staff" ? "Staff" : "Website") },
          { header: "Staff notes", value: (b) => b.notes ?? "", wrap: true },
        ],
      };
    },
  });
}
