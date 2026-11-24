"use client";

import { useActionState, useState } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BookingSlotKind } from "@/db/schema/bookings";
import { saveSlotAction } from "@/modules/bookings/actions";
import { BOOKING_KIND_LABELS, BOOKING_KIND_VALUES, MAX_SLOT_CAPACITY } from "@/modules/bookings/schemas";

const INPUT = "h-12 text-base";
const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export type SlotFormValues = {
  id?: string;
  kind: BookingSlotKind;
  title: string;
  trade: string;
  courseId: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  venue: string;
  capacity: number | null;
  instructions: string | null;
  feeNote: string | null;
};

const FIELD_LABELS = {
  kind: "Type",
  title: "Title",
  trade: "Trade",
  courseId: "Course",
  date: "Date",
  startTime: "Start time",
  endTime: "End time",
  venue: "Place",
  capacity: "Seats",
  instructions: "What to bring",
  feeNote: "Fees",
};

/**
 * Create or edit a trade test / training date. Phone-friendly native date and time pickers; a blank place means the
 * office address. Saving opens the slot page (the server action redirects).
 */
export function SlotForm({ values, courses, officeAddress, today }: { values?: SlotFormValues; courses: { value: string; label: string }[]; officeAddress: string; today: string }) {
  const [state, formAction] = useActionState(saveSlotAction, null);
  const [kind, setKind] = useState<BookingSlotKind>(values?.kind ?? "trade_test");
  const editing = Boolean(values?.id);

  return (
    <form action={formAction} onResetCapture={keepFormValues} noValidate className="space-y-6" data-testid="slot-form">
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Type</legend>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          {BOOKING_KIND_VALUES.map((value) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 text-base has-checked:border-navy has-checked:bg-surface-subtle">
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="size-5 accent-[var(--brand-navy)]" />
              {BOOKING_KIND_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Title" name="title" required state={state} hint="What people book, in plain words.">
          <Input defaultValue={values?.title} maxLength={120} placeholder={kind === "training" ? "For example: Scaffolding training, morning batch" : "For example: 6G pipe welding test"} className={INPUT} />
        </FormField>
        <FormField label="Trade" name="trade" required state={state}>
          <Input defaultValue={values?.trade} maxLength={80} placeholder={kind === "training" ? "For example: Scaffolder" : "For example: Pipe welder 6G"} className={INPUT} />
        </FormField>
      </div>

      {kind === "training" ? (
        <FormField label="Course" name="courseId" optional state={state} hint="Links this date to the course page, where people see a Book a training seat button.">
          <select className={SELECT} defaultValue={values?.courseId ?? ""}>
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Date" name="date" required state={state}>
          <Input type="date" defaultValue={values?.date} min={editing ? undefined : today} className={INPUT} />
        </FormField>
        <FormField label="Start time" name="startTime" required state={state}>
          <Input type="time" defaultValue={values?.startTime} className={INPUT} />
        </FormField>
        <FormField label="End time" name="endTime" optional state={state}>
          <Input type="time" defaultValue={values?.endTime ?? undefined} className={INPUT} />
        </FormField>
      </div>

      <div className="grid gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
        <FormField label="Seats" name="capacity" required state={state} hint="How many people can come.">
          <Input type="number" inputMode="numeric" min={1} max={MAX_SLOT_CAPACITY} step={1} defaultValue={values?.capacity ?? undefined} className={INPUT} />
        </FormField>
        <FormField label="Place" name="venue" optional state={state} hint={`Leave empty for our office: ${officeAddress}`}>
          <Input defaultValue={values?.venue && values.venue !== officeAddress ? values.venue : undefined} maxLength={300} className={INPUT} />
        </FormField>
      </div>

      <FormField label="What to bring" name="instructions" optional state={state} hint="Shown on the booking page and in the confirmation.">
        <Textarea defaultValue={values?.instructions ?? undefined} rows={3} maxLength={1000} placeholder="For example: Bring passport copy, two photos and safety shoes." className="text-base" />
      </FormField>

      <FormField
        label="Fees"
        name="feeNote"
        optional
        state={state}
        hint="Only if there is a fee: type it exactly as people should read it, with the currency. Never charge a candidate for a trade test that is part of a job application (the employer or Venkat Sai pays)."
      >
        <Input defaultValue={values?.feeNote ?? undefined} maxLength={200} className={INPUT} />
      </FormField>

      <SubmitButton pendingLabel="Saving…" className="min-h-12 w-full px-6 text-base sm:w-auto">
        {editing ? "Save changes" : "Open for booking"}
      </SubmitButton>
    </form>
  );
}
