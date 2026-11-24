import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CONTACT } from "@/config/contact";
import { listCourseOptions } from "@/modules/bookings/queries";
import { venueNow } from "@/modules/bookings/rules";
import { BOOKINGS_ADMIN_PATH, BOOKINGS_PERMISSION } from "@/modules/bookings/schemas";
import { requireStaff } from "@/modules/identity/authz";

import { SlotForm } from "../_components/slot-form";

export const metadata: Metadata = { title: "New booking date" };

/** Open a new trade test or training date (it appears on /book at once). */
export default async function NewSlotPage() {
  const ctx = await requireStaff(BOOKINGS_PERMISSION);
  const courses = await listCourseOptions(ctx);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="New trade test or training date"
        description="People can book as soon as you save. You can close or cancel the date later."
        backLink={{ href: BOOKINGS_ADMIN_PATH, label: "Bookings" }}
      />
      <SlotForm courses={courses} officeAddress={CONTACT.address.oneLine} today={venueNow().date} />
    </div>
  );
}
