"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { CountrySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { track } from "@/modules/analytics/client";
import { createBatchAction, updateBatchAction } from "@/modules/training/actions";
import { COURSE_MODE_LABELS, COURSE_MODES } from "@/modules/training/constants";

import { eitherFormAction, useInstitutionForm } from "./use-form-action";

export type BatchFormDefaults = {
  courseId?: string;
  title?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  schedule?: string | null;
  timezone?: string | null;
  mode?: string;
  venue?: string | null;
  countryCode?: string | null;
  city?: string | null;
  capacity?: number | null;
  registrationDeadline?: string | null;
  enrolledCount?: number;
};

const LABELS = {
  courseId: "Course",
  title: "Batch title",
  startsOn: "Start date",
  endsOn: "End date",
  schedule: "Timetable",
  timezone: "Time zone",
  mode: "Delivery",
  venue: "Venue",
  countryCode: "Country",
  city: "City",
  capacity: "Seats",
  registrationDeadline: "Registration closes",
};

const modeOptions = COURSE_MODES.map((m) => ({ value: m, label: COURSE_MODE_LABELS[m] }));

export function BatchForm({
  batchId,
  courseOptions,
  countries,
  defaults = {},
}: {
  batchId?: string;
  /** Required when creating: the institution's courses. */
  courseOptions?: SelectOption[];
  countries: SelectOption[];
  defaults?: BatchFormDefaults;
}) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(eitherFormAction(updateBatchAction, createBatchAction, Boolean(batchId)));
  const formId = batchId ? "institution_batch_edit" : "institution_batch_create";
  useActionToast(state);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      const created = state.data as { id?: string } | undefined;
      router.push(`/institution/batches/${batchId ?? created?.id ?? ""}`);
    } else track("error_shown", { formId });
  }, [state, batchId, router, formId]);

  return (
    <form
      onSubmit={(e) => {
        track("form_submitted", { formId });
        onSubmit(e);
      }}
      noValidate
      className="space-y-8"
    >
      {batchId ? <input type="hidden" name="batchId" value={batchId} /> : null}
      <FormErrorAlert state={state} fieldLabels={LABELS} />

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Batch</legend>
        {!batchId ? (
          courseOptions?.length ? (
            <FormField label={LABELS.courseId} name="courseId" required state={state} hint="Batches can open for enrolment once the course is published.">
              <SearchableSelect options={courseOptions} defaultValue={defaults.courseId} placeholder="Choose a course" />
            </FormField>
          ) : (
            <Callout tone="info" title="Create a course first" action={{ label: "New course", href: "/institution/courses/new" }}>
              Batches are scheduled runs of one of your courses.
            </Callout>
          )
        ) : null}
        <FormField label={LABELS.title} name="title" required state={state} hint="For example January 2027 morning batch.">
          <Input maxLength={200} defaultValue={defaults.title} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={LABELS.startsOn} name="startsOn" optional state={state}>
            <Input type="date" defaultValue={defaults.startsOn ?? undefined} />
          </FormField>
          <FormField label={LABELS.endsOn} name="endsOn" optional state={state}>
            <Input type="date" defaultValue={defaults.endsOn ?? undefined} />
          </FormField>
          <FormField label={LABELS.registrationDeadline} name="registrationDeadline" optional state={state}>
            <Input type="date" defaultValue={defaults.registrationDeadline ?? undefined} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={LABELS.schedule} name="schedule" optional state={state} hint="For example Mon to Sat, 09:00 to 13:00.">
            <Input maxLength={300} defaultValue={defaults.schedule ?? undefined} />
          </FormField>
          <FormField label={LABELS.timezone} name="timezone" optional state={state} hint="IANA name, for example Asia/Kolkata.">
            <Input maxLength={64} defaultValue={defaults.timezone ?? undefined} autoComplete="off" />
          </FormField>
          <FormField
            label={LABELS.capacity}
            name="capacity"
            optional
            state={state}
            hint={defaults.enrolledCount ? `At least ${defaults.enrolledCount} (seats already taken). Leave empty for no limit.` : "Leave empty for no seat limit. Applications beyond capacity are waitlisted."}
          >
            <Input type="number" inputMode="numeric" min={Math.max(1, defaults.enrolledCount ?? 1)} max={10000} defaultValue={defaults.capacity ?? undefined} />
          </FormField>
          <FormField label={LABELS.mode} name="mode" required state={state}>
            <SimpleSelect options={modeOptions} defaultValue={defaults.mode ?? "in_person"} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Location</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={LABELS.venue} name="venue" optional state={state} className="sm:col-span-2">
            <Input maxLength={300} defaultValue={defaults.venue ?? undefined} />
          </FormField>
          <FormField label={LABELS.countryCode} name="countryCode" optional state={state}>
            {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.countryCode ?? undefined} placeholder="Choose a country" allowClear clearLabel="Not set" />}
          </FormField>
          <FormField label={LABELS.city} name="city" optional state={state}>
            <Input maxLength={120} defaultValue={defaults.city ?? undefined} />
          </FormField>
        </div>
      </fieldset>

      <div className="flex justify-end border-t border-border pt-6">
        <SubmitButton pending={pending} pendingLabel="Saving…" disabled={!batchId && !courseOptions?.length}>
          {batchId ? "Save batch" : "Schedule batch"}
        </SubmitButton>
      </div>
    </form>
  );
}
