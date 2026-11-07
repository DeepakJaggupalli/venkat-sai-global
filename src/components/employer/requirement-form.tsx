"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FileUpload } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { CountrySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";
import { track } from "@/modules/analytics/client";
import type { FileSummary } from "@/modules/files/types";
import { submitEmployerRequirementAction, updateEmployerRequirementAction } from "@/modules/operations/actions";
import { REQUIREMENT_BENEFIT_OPTIONS, REQUIREMENT_INTERVIEW_METHOD_LABELS, REQUIREMENT_KIND_LABELS, REQUIREMENT_URGENCY_LABELS } from "@/modules/operations/constants";

import { RequirementLinesEditor, type RequirementLineDraft } from "./requirement-lines";
import { useEmployerForm } from "./use-form-action";

export type RequirementFormDefaults = {
  kind?: string;
  title?: string;
  description?: string;
  countryCode?: string;
  locations?: string;
  industryId?: string;
  contractDurationMonths?: string;
  workingHours?: string;
  joiningBy?: string;
  interviewMethod?: string;
  interviewDetails?: string;
  assessmentRequired?: boolean;
  assessmentDetails?: string;
  documentationRequirements?: string;
  languageRequirements?: string;
  benefits?: string[];
  accommodationProvided?: boolean;
  foodProvided?: boolean;
  transportProvided?: boolean;
  urgency?: string;
  contactName?: string;
  contactDesignation?: string;
  contactEmail?: string;
  contactPhone?: string;
  lines?: RequirementLineDraft[];
};

const opts = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const SUGGESTED = REQUIREMENT_BENEFIT_OPTIONS.map((b) => b.value as string);

const FIELD_LABELS: Record<string, string> = {
  title: "Requirement title",
  kind: "Type of requirement",
  countryCode: "Country of work",
  joiningBy: "Joining by",
  contractDurationMonths: "Contract duration",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  lines: "Trades",
  attachmentFileIds: "Attachments",
};

function Check({ name, label, defaultChecked, value = "true" }: { name: string; label: string; defaultChecked?: boolean; value?: string }) {
  const id = `${name}-${value}`.replace(/[^a-z0-9-]/gi, "-");
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 size-4 shrink-0 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <label htmlFor={id} className="text-sm leading-6">
        {label}
      </label>
    </div>
  );
}

/** New / edit workforce requirement with repeatable trade lines (Employer Portal, spec 9.3). */
export function RequirementForm({
  requirementId,
  organizationId,
  defaults,
  attachments,
  options,
  defaultCurrency,
  submitBlockedReason,
}: {
  requirementId?: string;
  organizationId: string;
  defaults: RequirementFormDefaults;
  attachments: FileSummary[];
  options: { countries: SelectOption[]; industries: SelectOption[]; categories: SelectOption[]; currencies: SelectOption[] };
  defaultCurrency?: string;
  /** Plan limit or suspension: submitting is blocked, drafts still work. */
  submitBlockedReason?: string | null;
}) {
  const router = useRouter();
  const action = (requirementId ? updateEmployerRequirementAction : submitEmployerRequirementAction) as unknown as (
    prev: ActionState<{ id?: string }>,
    formData: FormData,
  ) => Promise<ActionResult<{ id?: string }>>;
  const { state, pending, onSubmit } = useEmployerForm(action);
  const handled = useRef(state);
  const started = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [assessment, setAssessment] = useState(Boolean(defaults.assessmentRequired));
  useActionToast(state);

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (!state?.ok) return;
    track("form_submitted", { formId: "employer_requirement" });
    const id = (state.data as { id?: string } | undefined)?.id ?? requirementId;
    if (id) router.push(`/employer/requirements/${id}`);
  }, [state, requirementId, router]);

  const otherBenefits = (defaults.benefits ?? []).filter((b) => !SUGGESTED.includes(b));

  return (
    <form
      onSubmit={onSubmit}
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        track("form_started", { formId: "employer_requirement" });
      }}
      noValidate
      className="space-y-6"
    >
      {requirementId ? <input type="hidden" name="id" value={requirementId} /> : null}
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />

      <fieldset className="space-y-4 rounded-xl border border-border bg-background p-5 sm:p-6">
        <legend className="sr-only">About the requirement</legend>
        <p className="font-heading text-lg font-semibold text-navy" aria-hidden="true">
          About the requirement
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Requirement title" name="title" required state={state} className="sm:col-span-2" hint="For example Shutdown crew for refinery maintenance, Jubail.">
            <Input defaultValue={defaults.title} maxLength={200} />
          </FormField>
          <FormField label="Type of requirement" name="kind" state={state}>
            <SimpleSelect options={opts(REQUIREMENT_KIND_LABELS)} defaultValue={defaults.kind ?? "bulk"} />
          </FormField>
          <FormField label="Urgency" name="urgency" state={state}>
            <SimpleSelect options={opts(REQUIREMENT_URGENCY_LABELS)} defaultValue={defaults.urgency ?? "normal"} />
          </FormField>
          <FormField label="Industry" name="industryId" optional state={state}>
            <SearchableSelect options={options.industries} defaultValue={defaults.industryId} placeholder="Choose an industry" allowClear />
          </FormField>
          <FormField label="Joining by" name="joiningBy" optional state={state} hint="When people need to start or mobilise.">
            <Input type="date" defaultValue={defaults.joiningBy} />
          </FormField>
        </div>
        <FormField label="Description" name="description" optional state={state} hint="The project, the site and anything candidates should know.">
          <Textarea defaultValue={defaults.description} rows={4} maxLength={10000} />
        </FormField>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-background p-5 sm:p-6">
        <legend className="sr-only">Trades and positions</legend>
        <div aria-hidden="true">
          <p className="font-heading text-lg font-semibold text-navy">Trades and positions</p>
          <p className="text-sm text-muted-foreground">Add one line per trade. Salaries are per person in the currency you choose.</p>
        </div>
        <RequirementLinesEditor
          defaultLines={defaults.lines ?? []}
          categories={options.categories}
          currencies={options.currencies}
          fieldErrors={state?.ok === false ? state.fieldErrors : undefined}
          defaultCurrency={defaultCurrency}
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-background p-5 sm:p-6">
        <legend className="sr-only">Work and conditions</legend>
        <p className="font-heading text-lg font-semibold text-navy" aria-hidden="true">
          Work and conditions
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Country of work" name="countryCode" optional state={state}>
            {(field) => <CountrySelect {...field} options={options.countries} defaultValue={defaults.countryCode} placeholder="Choose a country" allowClear />}
          </FormField>
          <FormField label="Work sites / cities" name="locations" optional state={state}>
            <Input defaultValue={defaults.locations} maxLength={500} />
          </FormField>
          <FormField label="Contract duration (months)" name="contractDurationMonths" optional state={state}>
            <Input type="number" inputMode="numeric" min={1} max={600} defaultValue={defaults.contractDurationMonths} />
          </FormField>
          <FormField label="Working hours" name="workingHours" optional state={state}>
            <Input defaultValue={defaults.workingHours} maxLength={300} placeholder="8 hours a day, 6 days a week" />
          </FormField>
          <FormField label="Language requirements" name="languageRequirements" optional state={state} className="sm:col-span-2">
            <Input defaultValue={defaults.languageRequirements} maxLength={500} placeholder="Basic English, Hindi" />
          </FormField>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Check name="accommodationProvided" label="Accommodation provided" defaultChecked={defaults.accommodationProvided} />
          <Check name="foodProvided" label="Food provided" defaultChecked={defaults.foodProvided} />
          <Check name="transportProvided" label="Transport provided" defaultChecked={defaults.transportProvided} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Benefits offered</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {REQUIREMENT_BENEFIT_OPTIONS.map((b) => (
              <Check key={b.value} name="benefits[]" value={b.value} label={b.label} defaultChecked={defaults.benefits?.includes(b.value)} />
            ))}
          </div>
          <FormField label="Other benefits" name="benefits" optional state={state} hint="Press Enter after each one.">
            {(field) => <TagInput {...field} name="benefits" defaultValue={otherBenefits} maxTags={14} maxLength={80} placeholder="Add a benefit" />}
          </FormField>
        </fieldset>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-background p-5 sm:p-6">
        <legend className="sr-only">Selection process</legend>
        <div aria-hidden="true">
          <p className="font-heading text-lg font-semibold text-navy">Selection process</p>
          <p className="text-sm text-muted-foreground">Interviews and trade tests for your requirement are paid by you or Venkat Sai, never by candidates.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Interview method" name="interviewMethod" optional state={state}>
            <SimpleSelect options={opts(REQUIREMENT_INTERVIEW_METHOD_LABELS)} defaultValue={defaults.interviewMethod} placeholder="Choose a method" allowClear />
          </FormField>
          <FormField label="Interview dates and venue" name="interviewDetails" optional state={state}>
            <Input defaultValue={defaults.interviewDetails} maxLength={2000} />
          </FormField>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="assessmentRequired"
            type="checkbox"
            name="assessmentRequired"
            value="true"
            checked={assessment}
            onChange={(e) => setAssessment(e.target.checked)}
            className="mt-1 size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <label htmlFor="assessmentRequired" className="text-sm leading-6">
            A trade test or skill assessment is required
          </label>
        </div>
        {assessment ? (
          <FormField label="Assessment details" name="assessmentDetails" optional state={state} hint="For example practical welding test, 6G position. Venkat Sai assessments are not accredited certifications.">
            <Textarea defaultValue={defaults.assessmentDetails} rows={2} maxLength={2000} />
          </FormField>
        ) : null}
        <FormField label="Documents candidates need" name="documentationRequirements" optional state={state} hint="For example passport valid 2+ years, experience letters, PCC.">
          <Textarea defaultValue={defaults.documentationRequirements} rows={2} maxLength={2000} />
        </FormField>
        <FileUpload
          purpose="org_document"
          name="attachmentFileIds"
          organizationId={organizationId}
          multiple
          maxFiles={10}
          label="Attachments (optional)"
          description="Demand letter, job descriptions or drawings. PDF or images, up to 10 files."
          defaultFiles={attachments}
          onUploadingChange={setUploading}
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-background p-5 sm:p-6">
        <legend className="sr-only">Contact for this requirement</legend>
        <div aria-hidden="true">
          <p className="font-heading text-lg font-semibold text-navy">Contact for this requirement</p>
          <p className="text-sm text-muted-foreground">Leave empty to use your own account details.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Contact person" name="contactName" optional state={state}>
            <Input defaultValue={defaults.contactName} maxLength={120} />
          </FormField>
          <FormField label="Designation" name="contactDesignation" optional state={state}>
            <Input defaultValue={defaults.contactDesignation} maxLength={120} />
          </FormField>
          <FormField label="Email" name="contactEmail" optional state={state}>
            <Input type="email" defaultValue={defaults.contactEmail} maxLength={254} />
          </FormField>
          <FormField label="Phone" name="contactPhone" optional state={state}>
            <Input type="tel" defaultValue={defaults.contactPhone} maxLength={24} />
          </FormField>
        </div>
      </fieldset>

      {submitBlockedReason ? (
        <Callout tone="warning" title="You can save a draft, but not submit yet" action={{ label: "View plans", href: "/employer/billing" }}>
          {submitBlockedReason}
        </Callout>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-3 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-xl sm:border">
        <SubmitButton variant="outline" name="asDraft" value="true" pending={pending} disabled={uploading} pendingLabel="Saving…">
          Save draft
        </SubmitButton>
        <SubmitButton name="asDraft" value="false" pending={pending} disabled={uploading || Boolean(submitBlockedReason)} pendingLabel="Submitting…">
          Submit to Venkat Sai
        </SubmitButton>
      </div>
    </form>
  );
}
