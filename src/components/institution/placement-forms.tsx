"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { FileUpload } from "@/components/files";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { CountrySelect, CurrencySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createCampusDriveAction,
  createInternshipAction,
  deletePlacementOutcomeAction,
  recordPlacementOutcomeAction,
  setCampusDriveStatusAction,
  setInternshipStatusAction,
  updateCampusDriveAction,
  updateCampusRegistrationStatusAction,
  updateInternshipAction,
} from "@/modules/training/actions";

import { DRIVE_MODE_LABELS, OUTCOME_SOURCE_LABELS, REGISTRATION_STATUS, STIPEND_TYPE_LABELS, toOptions } from "./labels";
import { eitherFormAction, useInstitutionForm } from "./use-form-action";

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
  { value: "apprenticeship", label: "Apprenticeship" },
];
const PERIOD_OPTIONS = [
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
  { value: "year", label: "Per year" },
];

/** Dialog wrapper with an "Add" trigger; the form closes it on success. */
function FormDialog({ label, title, children, variant = "default" }: { label: string; title: string; children: (close: () => void) => ReactNode; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" /> {label}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={title} size="lg">
        {open ? children(() => setOpen(false)) : null}
      </ResponsiveDialog>
    </>
  );
}

/** Dialog opened from a plain button (edit forms). */
function EditDialog({ label, title, children }: { label: string; title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={title} size="lg">
        {open ? children(() => setOpen(false)) : null}
      </ResponsiveDialog>
    </>
  );
}

function useDone(state: { ok: boolean; data?: unknown } | null, onDone: (data?: unknown) => void) {
  const router = useRouter();
  const handled = useRef<unknown>(null);
  useEffect(() => {
    // Handle each successful submission once, even if the parent re-renders with a new callback.
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      router.refresh();
      onDone(state.data);
    }
  }, [state, router, onDone]);
}

// ---------------------------------------------------------------------------
// Campus drives
// ---------------------------------------------------------------------------

export type DriveDefaults = Partial<{
  title: string;
  description: string | null;
  employerName: string | null;
  driveDate: string | null;
  driveEndDate: string | null;
  registrationDeadline: string | null;
  mode: string;
  venue: string | null;
  countryCode: string | null;
  city: string | null;
  eligibility: string | null;
  openings: number | null;
  capacity: number | null;
  isPublic: boolean;
}>;

export function DriveForm({ driveId, defaults = {}, countries, onDone }: { driveId?: string; defaults?: DriveDefaults; countries: SelectOption[]; onDone: () => void }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(eitherFormAction(updateCampusDriveAction, createCampusDriveAction, Boolean(driveId)));
  useActionToast(state);
  useDone(state, (data) => {
    const id = (data as { id?: string } | undefined)?.id;
    if (!driveId && id) router.push(`/institution/placements/drives/${id}`);
    onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {driveId ? <input type="hidden" name="driveId" value={driveId} /> : null}
      <FormErrorAlert
        state={state}
        fieldLabels={{ title: "Title", employerName: "Employer", driveDate: "Drive date", driveEndDate: "End date", registrationDeadline: "Registration closes", mode: "Mode", capacity: "Capacity", openings: "Openings" }}
      />
      <FormField label="Title" name="title" required state={state}>
        <Input maxLength={200} defaultValue={defaults.title} />
      </FormField>
      <FormField label="Employer" name="employerName" optional state={state} hint="The recruiting employer, if confirmed. Never list an employer that has not agreed to take part.">
        <Input maxLength={200} defaultValue={defaults.employerName ?? undefined} />
      </FormField>
      <FormField label="Description" name="description" optional state={state}>
        <Textarea rows={3} maxLength={5000} defaultValue={defaults.description ?? undefined} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Drive date" name="driveDate" optional state={state}>
          <Input type="date" defaultValue={defaults.driveDate ?? undefined} />
        </FormField>
        <FormField label="End date" name="driveEndDate" optional state={state}>
          <Input type="date" defaultValue={defaults.driveEndDate ?? undefined} />
        </FormField>
        <FormField label="Registration closes" name="registrationDeadline" optional state={state}>
          <Input type="date" defaultValue={defaults.registrationDeadline ?? undefined} />
        </FormField>
        <FormField label="Mode" name="mode" required state={state}>
          <SimpleSelect options={toOptions(DRIVE_MODE_LABELS)} defaultValue={defaults.mode ?? "in_person"} />
        </FormField>
        <FormField label="Openings" name="openings" optional state={state}>
          <Input type="number" inputMode="numeric" min={1} defaultValue={defaults.openings ?? undefined} />
        </FormField>
        <FormField label="Capacity" name="capacity" optional state={state} hint="Maximum registrations.">
          <Input type="number" inputMode="numeric" min={1} defaultValue={defaults.capacity ?? undefined} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Venue" name="venue" optional state={state} className="sm:col-span-2">
          <Input maxLength={300} defaultValue={defaults.venue ?? undefined} />
        </FormField>
        <FormField label="Country" name="countryCode" optional state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.countryCode ?? undefined} allowClear clearLabel="Not set" placeholder="Choose a country" />}
        </FormField>
        <FormField label="City" name="city" optional state={state}>
          <Input maxLength={120} defaultValue={defaults.city ?? undefined} />
        </FormField>
      </div>
      <FormField label="Eligibility" name="eligibility" optional state={state}>
        <Textarea rows={2} maxLength={2000} defaultValue={defaults.eligibility ?? undefined} />
      </FormField>
      <FormField label="List publicly" name="isPublic" optional state={state} hideLabel>
        {(field) => (
          <div className="flex items-start gap-3">
            <input {...field} type="checkbox" value="true" defaultChecked={defaults.isPublic ?? false} className="mt-1 size-4 accent-[var(--color-navy)]" />
            <label htmlFor={field.id} className="text-sm leading-6">
              List this drive on the public events page (verified institutions only). Private drives accept only your own learners.
            </label>
          </div>
        )}
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {driveId ? "Save drive" : "Create drive"}
        </SubmitButton>
      </div>
    </form>
  );
}

const DRIVE_TRANSITIONS: Record<string, { status: "open" | "planned" | "completed" | "cancelled"; label: string }[]> = {
  planned: [
    { status: "open", label: "Open registration" },
    { status: "cancelled", label: "Cancel drive" },
  ],
  open: [
    { status: "completed", label: "Mark completed" },
    { status: "planned", label: "Close registration" },
    { status: "cancelled", label: "Cancel drive" },
  ],
};

export function DriveStatusActions({ driveId, status }: { driveId: string; status: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {(DRIVE_TRANSITIONS[status] ?? []).map((t, i) => (
        <ConfirmDialog
          key={t.status}
          trigger={<Button variant={t.status === "cancelled" ? "ghost" : i === 0 ? "default" : "outline"}>{t.label}</Button>}
          title={`${t.label}?`}
          description={t.status === "cancelled" ? "Registered learners will see the drive as cancelled with your reason." : undefined}
          confirmLabel={t.label}
          variant={t.status === "cancelled" ? "destructive" : "default"}
          onConfirm={async (fd) => {
            fd.set("via", "institution");
            fd.set("driveId", driveId);
            fd.set("status", t.status);
            const result = await setCampusDriveStatusAction(null, fd);
            if (result.ok) router.refresh();
            return result;
          }}
        >
          {t.status === "cancelled" ? (
            <div className="space-y-2">
              <Label htmlFor={`drive-reason-${driveId}`}>Reason</Label>
              <Textarea id={`drive-reason-${driveId}`} name="reason" rows={2} maxLength={500} />
            </div>
          ) : null}
        </ConfirmDialog>
      ))}
    </div>
  );
}

export function RegistrationStatusSelect({ registrationId, status, name }: { registrationId: string; status: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const options = Object.entries(REGISTRATION_STATUS)
    .filter(([k]) => k !== "withdrawn")
    .map(([value, b]) => ({ value, label: b.label }));
  if (status === "withdrawn") return <span className="text-sm text-muted-foreground">Withdrawn by the learner</span>;
  return (
    <SimpleSelect
      aria-label={`Status for ${name}`}
      options={options}
      value={value}
      onValueChange={async (next) => {
        const previous = value;
        setValue(next);
        const result = await updateCampusRegistrationStatusAction({ via: "institution", registrationId, status: next as "registered" });
        if (result.ok) {
          toast.success(result.message ?? "Registration updated.");
          router.refresh();
        } else {
          setValue(previous);
          toast.error(result.error);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Internship programmes
// ---------------------------------------------------------------------------

export type InternshipDefaults = Partial<{
  title: string;
  description: string | null;
  eligibility: string | null;
  durationWeeks: number | null;
  startsOn: string | null;
  applicationDeadline: string | null;
  workMode: string | null;
  countryCode: string | null;
  city: string | null;
  stipendType: string;
  stipendAmount: number | null;
  stipendCurrency: string | null;
  stipendPeriod: string | null;
  seats: number | null;
  hostEmployerName: string | null;
}>;

export function InternshipForm({
  internshipId,
  defaults = {},
  countries,
  currencies,
  onDone,
}: {
  internshipId?: string;
  defaults?: InternshipDefaults;
  countries: SelectOption[];
  currencies: SelectOption[];
  onDone: () => void;
}) {
  const { state, pending, onSubmit } = useInstitutionForm(eitherFormAction(updateInternshipAction, createInternshipAction, Boolean(internshipId)));
  const [stipendType, setStipendType] = useState(defaults.stipendType ?? "not_disclosed");
  useActionToast(state);
  useDone(state, onDone);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {internshipId ? <input type="hidden" name="internshipId" value={internshipId} /> : null}
      <FormErrorAlert state={state} fieldLabels={{ title: "Title", stipendType: "Stipend", stipendAmount: "Stipend amount", stipendCurrency: "Currency", stipendPeriod: "Paid", seats: "Seats" }} />
      <FormField label="Title" name="title" required state={state}>
        <Input maxLength={200} defaultValue={defaults.title} />
      </FormField>
      <FormField label="Host employer" name="hostEmployerName" optional state={state} hint="Only an employer that has agreed to host interns.">
        <Input maxLength={200} defaultValue={defaults.hostEmployerName ?? undefined} />
      </FormField>
      <FormField label="Description" name="description" optional state={state}>
        <Textarea rows={3} maxLength={5000} defaultValue={defaults.description ?? undefined} />
      </FormField>
      <FormField label="Eligibility" name="eligibility" optional state={state}>
        <Textarea rows={2} maxLength={2000} defaultValue={defaults.eligibility ?? undefined} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Starts on" name="startsOn" optional state={state}>
          <Input type="date" defaultValue={defaults.startsOn ?? undefined} />
        </FormField>
        <FormField label="Applications close" name="applicationDeadline" optional state={state}>
          <Input type="date" defaultValue={defaults.applicationDeadline ?? undefined} />
        </FormField>
        <FormField label="Duration (weeks)" name="durationWeeks" optional state={state}>
          <Input type="number" inputMode="numeric" min={1} max={260} defaultValue={defaults.durationWeeks ?? undefined} />
        </FormField>
        <FormField label="Work mode" name="workMode" optional state={state}>
          <SimpleSelect
            options={[
              { value: "on_site", label: "On site" },
              { value: "remote", label: "Remote" },
              { value: "hybrid", label: "Hybrid" },
            ]}
            defaultValue={defaults.workMode ?? undefined}
            allowClear
            clearLabel="Not set"
            placeholder="Choose"
          />
        </FormField>
        <FormField label="Seats" name="seats" optional state={state}>
          <Input type="number" inputMode="numeric" min={1} defaultValue={defaults.seats ?? undefined} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Country" name="countryCode" optional state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.countryCode ?? undefined} allowClear clearLabel="Not set" placeholder="Choose a country" />}
        </FormField>
        <FormField label="City" name="city" optional state={state}>
          <Input maxLength={120} defaultValue={defaults.city ?? undefined} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <FormField label="Stipend" name="stipendType" required state={state}>
          <SimpleSelect options={toOptions(STIPEND_TYPE_LABELS)} value={stipendType} onValueChange={setStipendType} />
        </FormField>
        {stipendType === "fixed" ? (
          <>
            <FormField label="Stipend amount" name="stipendAmount" required state={state}>
              <Input type="number" inputMode="decimal" min={0} step="0.01" defaultValue={defaults.stipendAmount ?? undefined} />
            </FormField>
            <FormField label="Currency" name="stipendCurrency" required state={state}>
              {(field) => <CurrencySelect {...field} options={currencies} defaultValue={defaults.stipendCurrency ?? undefined} placeholder="Choose" />}
            </FormField>
            <FormField label="Paid" name="stipendPeriod" required state={state}>
              <SimpleSelect options={PERIOD_OPTIONS} defaultValue={defaults.stipendPeriod ?? "month"} />
            </FormField>
          </>
        ) : null}
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {internshipId ? "Save programme" : "Save as draft"}
        </SubmitButton>
      </div>
    </form>
  );
}

const INTERNSHIP_TRANSITIONS: Record<string, { status: "open" | "closed" | "completed" | "cancelled" | "draft"; label: string }[]> = {
  draft: [
    { status: "open", label: "Open" },
    { status: "cancelled", label: "Cancel" },
  ],
  open: [
    { status: "closed", label: "Close applications" },
    { status: "cancelled", label: "Cancel" },
  ],
  closed: [
    { status: "completed", label: "Mark completed" },
    { status: "open", label: "Reopen" },
  ],
};

export function InternshipStatusActions({ internshipId, status, title }: { internshipId: string; status: string; title: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {(INTERNSHIP_TRANSITIONS[status] ?? []).map((t) => (
        <ConfirmDialog
          key={t.status}
          trigger={
            <Button size="sm" variant={t.status === "cancelled" ? "ghost" : "outline"}>
              {t.label}
              <span className="sr-only"> {title}</span>
            </Button>
          }
          title={`${t.label}: ${title}?`}
          confirmLabel={t.label}
          variant={t.status === "cancelled" ? "destructive" : "default"}
          onConfirm={async () => {
            const result = await setInternshipStatusAction({ via: "institution", internshipId, status: t.status });
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placement outcomes
// ---------------------------------------------------------------------------

export function OutcomeForm({
  organizationId,
  learners,
  drives,
  countries,
  currencies,
  onDone,
}: {
  organizationId: string;
  learners: SelectOption[];
  drives: SelectOption[];
  countries: SelectOption[];
  currencies: SelectOption[];
  onDone: () => void;
}) {
  const { state, pending, onSubmit } = useInstitutionForm(recordPlacementOutcomeAction);
  const [uploading, setUploading] = useState(false);
  useActionToast(state);
  useDone(state, onDone);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormErrorAlert
        state={state}
        fieldLabels={{ enrolmentId: "Learner", sourceType: "How the placement came about", employerName: "Employer", jobTitle: "Job title", placedOn: "Placement date", salaryAmount: "Salary", salaryCurrency: "Currency", evidenceFileId: "Evidence" }}
      />
      <p className="text-sm text-muted-foreground">
        Outcomes count as self-reported until Venkat Sai verifies them against the evidence. Only verified outcomes can feed public figures.
      </p>
      <FormField label="Learner" name="enrolmentId" required state={state} hint="Learners of your batches.">
        <SearchableSelect options={learners} placeholder="Choose a learner" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="How the placement came about" name="sourceType" required state={state}>
          <SimpleSelect options={toOptions(OUTCOME_SOURCE_LABELS, ["institution", "campus_drive", "self", "other"])} defaultValue="institution" />
        </FormField>
        {drives.length ? (
          <FormField label="Campus drive" name="campusDriveId" optional state={state}>
            <SimpleSelect options={drives} allowClear clearLabel="None" placeholder="Choose a drive" />
          </FormField>
        ) : null}
        <FormField label="Employer" name="employerName" required state={state}>
          <Input maxLength={200} />
        </FormField>
        <FormField label="Job title" name="jobTitle" required state={state}>
          <Input maxLength={200} />
        </FormField>
        <FormField label="Placement date" name="placedOn" required state={state}>
          <Input type="date" />
        </FormField>
        <FormField label="Employment type" name="employmentType" optional state={state}>
          <SimpleSelect options={EMPLOYMENT_TYPE_OPTIONS} allowClear clearLabel="Not set" placeholder="Choose" />
        </FormField>
        <FormField label="Country" name="countryCode" optional state={state}>
          {(field) => <CountrySelect {...field} options={countries} allowClear clearLabel="Not set" placeholder="Choose a country" />}
        </FormField>
        <FormField label="City" name="city" optional state={state}>
          <Input maxLength={120} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Salary" name="salaryAmount" optional state={state}>
          <Input type="number" inputMode="decimal" min={0} step="0.01" />
        </FormField>
        <FormField label="Currency" name="salaryCurrency" optional state={state}>
          {(field) => <CurrencySelect {...field} options={currencies} placeholder="Choose" allowClear clearLabel="None" />}
        </FormField>
        <FormField label="Paid" name="salaryPeriod" optional state={state}>
          <SimpleSelect options={PERIOD_OPTIONS} allowClear clearLabel="Not set" placeholder="Choose" />
        </FormField>
      </div>
      <FileUpload
        purpose="org_document"
        name="evidenceFileId"
        organizationId={organizationId}
        label="Evidence"
        description="Offer or appointment letter (PDF or image). Needed before Venkat Sai can verify the outcome. Private to Venkat Sai's team."
        onUploadingChange={setUploading}
      />
      <FormField label="Notes" name="notes" optional state={state} hint="Internal to your institution and Venkat Sai.">
        <Textarea rows={2} maxLength={2000} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={uploading} pendingLabel="Saving…">
          Record outcome
        </SubmitButton>
      </div>
    </form>
  );
}

export function DeleteOutcomeButton({ outcomeId, label }: { outcomeId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          Delete<span className="sr-only"> {label}</span>
        </Button>
      }
      title={`Delete ${label}?`}
      description="Verified outcomes cannot be deleted."
      confirmLabel="Delete outcome"
      variant="destructive"
      onConfirm={async () => {
        const result = await deletePlacementOutcomeAction({ via: "institution", outcomeId });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Client entry points used by server pages (render props cannot cross the server boundary)
// ---------------------------------------------------------------------------

export function NewDriveButton({ countries }: { countries: SelectOption[] }) {
  return <FormDialog label="New campus drive" title="New campus drive">{(close) => <DriveForm countries={countries} onDone={close} />}</FormDialog>;
}

export function EditDriveButton({ driveId, defaults, countries }: { driveId: string; defaults: DriveDefaults; countries: SelectOption[] }) {
  return <EditDialog label="Edit drive" title="Edit campus drive">{(close) => <DriveForm driveId={driveId} defaults={defaults} countries={countries} onDone={close} />}</EditDialog>;
}

export function NewInternshipButton({ countries, currencies }: { countries: SelectOption[]; currencies: SelectOption[] }) {
  return (
    <FormDialog label="New internship programme" title="New internship programme">
      {(close) => <InternshipForm countries={countries} currencies={currencies} onDone={close} />}
    </FormDialog>
  );
}

export function EditInternshipButton({ internshipId, defaults, countries, currencies }: { internshipId: string; defaults: InternshipDefaults; countries: SelectOption[]; currencies: SelectOption[] }) {
  return (
    <EditDialog label="Edit" title={`Edit ${defaults.title ?? "internship programme"}`}>
      {(close) => <InternshipForm internshipId={internshipId} defaults={defaults} countries={countries} currencies={currencies} onDone={close} />}
    </EditDialog>
  );
}

export function RecordOutcomeButton(props: { organizationId: string; learners: SelectOption[]; drives: SelectOption[]; countries: SelectOption[]; currencies: SelectOption[] }) {
  return <FormDialog label="Record a placement" title="Record a placement outcome">{(close) => <OutcomeForm {...props} onDone={close} />}</FormDialog>;
}
