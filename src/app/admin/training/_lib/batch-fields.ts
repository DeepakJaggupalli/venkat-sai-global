import "server-only";

import type { StaffFieldSpec } from "@/app/admin/pipeline/_shared/staff-form";
import { COURSE_MODES, COURSE_MODE_LABELS } from "@/modules/training/constants";
import type { BatchRow } from "@/modules/training/types";
import { countryOptions } from "@/modules/taxonomy/queries";

/** Batch form fields (create / edit) for Venkat Sai batches. Dates are calendar dates (YYYY-MM-DD). */
export async function batchFields(batch: BatchRow | null, defaults: { timeZone: string }): Promise<StaffFieldSpec[]> {
  const countries = await countryOptions();
  return [
    { name: "title", label: "Batch title", required: true, defaultValue: batch?.title, wide: true, maxLength: 200, placeholder: "e.g. January weekday batch" },
    { name: "startsOn", label: "Starts on", kind: "date", optional: true, defaultValue: batch?.startsOn },
    { name: "endsOn", label: "Ends on", kind: "date", optional: true, defaultValue: batch?.endsOn },
    { name: "registrationDeadline", label: "Registration closes", kind: "date", optional: true, defaultValue: batch?.registrationDeadline },
    { name: "capacity", label: "Seats", kind: "number", optional: true, min: 1, defaultValue: batch?.capacity, hint: "Leave empty for no fixed limit." },
    { name: "schedule", label: "Timetable", optional: true, defaultValue: batch?.schedule, placeholder: "e.g. Mon–Sat, 09:00–13:00", maxLength: 300 },
    { name: "timezone", label: "Time zone", optional: true, defaultValue: batch?.timezone ?? defaults.timeZone, hint: "IANA name, e.g. Asia/Kolkata or Asia/Dubai." },
    { name: "mode", label: "Delivery", kind: "select", required: true, options: COURSE_MODES.map((v) => ({ value: v, label: COURSE_MODE_LABELS[v] })), defaultValue: batch?.mode ?? "in_person" },
    { name: "venue", label: "Venue", optional: true, defaultValue: batch?.venue, maxLength: 300 },
    { name: "countryCode", label: "Country", kind: "search-select", optional: true, options: countries, defaultValue: batch?.countryCode, allowClear: true },
    { name: "city", label: "City", optional: true, defaultValue: batch?.city, maxLength: 120 },
  ];
}
