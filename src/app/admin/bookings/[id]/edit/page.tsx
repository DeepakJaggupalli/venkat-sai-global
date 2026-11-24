import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { CONTACT } from "@/config/contact";
import { getSlotForStaff, listCourseOptions } from "@/modules/bookings/queries";
import { venueNow } from "@/modules/bookings/rules";
import { BOOKINGS_ADMIN_PATH, BOOKINGS_PERMISSION } from "@/modules/bookings/schemas";
import { requireStaff } from "@/modules/identity/authz";

import { SlotForm } from "../../_components/slot-form";

export const metadata: Metadata = { title: "Edit booking date" };

/** Edit a date. Seats cannot go below what is booked; cancelled dates cannot be edited. */
export default async function EditSlotPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const { id } = await params;
  const detail = await getSlotForStaff(ctx, id, { log: false });
  if (!detail) notFound();
  const { slot } = detail;
  const courses = await listCourseOptions(ctx, slot.courseId);
  const back = { href: `${BOOKINGS_ADMIN_PATH}/${slot.id}`, label: slot.title };
  const active = detail.bookings.filter((b) => b.status !== "cancelled").length;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={`Edit ${slot.title}`} eyebrow={slot.code} backLink={back} />
      {slot.status === "cancelled" ? (
        <Callout tone="neutral" title="This date was cancelled">
          A cancelled date cannot be changed. Open a new date instead.
        </Callout>
      ) : (
        <>
          {active > 0 ? (
            <Callout tone="info" title={`${active} ${active === 1 ? "booking" : "bookings"} on this date`}>
              If you change the date, time or place, tell these people. The date page shows a WhatsApp button for each of them. Seats cannot be fewer than the {slot.bookedSeats} already booked.
            </Callout>
          ) : null}
          <SlotForm
            values={{
              id: slot.id,
              kind: slot.kind,
              title: slot.title,
              trade: slot.trade,
              courseId: slot.courseId,
              date: slot.date,
              startTime: slot.startTime,
              endTime: slot.endTime,
              venue: slot.venue,
              capacity: slot.capacity,
              instructions: slot.instructions,
              feeNote: slot.feeNote,
            }}
            courses={courses}
            officeAddress={CONTACT.address.oneLine}
            today={venueNow().date}
          />
        </>
      )}
    </div>
  );
}
