"use client";

import { useEffect, useRef } from "react";

import { INSTITUTION_FIELD_LABELS, InstitutionDetailsFields } from "@/components/institution/institution-details-fields";
import { useInstitutionForm } from "@/components/institution/use-form-action";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { track } from "@/modules/analytics/client";

import { createInstitutionAction } from "./actions";

const FIELD_LABELS = {
  ...INSTITUTION_FIELD_LABELS,
  institutionKind: "Kind of institution",
  accreditationBodies: "Accreditation / recognition bodies",
  affiliation: "Affiliation",
  establishedYear: "Year established",
  placementOfficerName: "Placement officer name",
  placementOfficerEmail: "Placement officer email",
  placementOfficerPhone: "Placement officer phone",
  representativeTitle: "Your designation",
  confirmAuthorised: "Authorisation confirmation",
};

export function InstitutionOnboardingForm({
  countries,
  industries,
  kindOptions,
  representativeName,
}: {
  countries: SelectOption[];
  industries: SelectOption[];
  kindOptions: SelectOption[];
  representativeName: string;
}) {
  const { state, pending, onSubmit } = useInstitutionForm(createInstitutionAction);
  useActionToast(state);
  const started = useRef(false);

  useEffect(() => {
    if (state?.ok === false) track("error_shown", { formId: "institution_onboarding" });
  }, [state]);

  return (
    <form
      onSubmit={(event) => {
        track("form_submitted", { formId: "institution_onboarding" });
        onSubmit(event);
      }}
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        track("institution_registration_started");
        track("form_started", { formId: "institution_onboarding" });
      }}
      noValidate
      className="space-y-8"
      aria-describedby="onboarding-intro"
    >
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Kind and recognition</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={FIELD_LABELS.institutionKind} name="institutionKind" required state={state}>
            <SimpleSelect options={kindOptions} placeholder="Choose one" />
          </FormField>
          <FormField label={FIELD_LABELS.establishedYear} name="establishedYear" optional state={state}>
            <Input type="number" inputMode="numeric" min={1800} max={2100} />
          </FormField>
          <FormField
            label={FIELD_LABELS.accreditationBodies}
            name="accreditationBodies"
            optional
            state={state}
            hint="For example AICTE, NCVT, SCVT, NAAC or a sector skill council. Shown as declared until Venkat Sai checks your documents."
            className="sm:col-span-2"
          >
            {(field) => <TagInput {...field} name="accreditationBodies" maxLength={200} placeholder="Type a body and press Enter" />}
          </FormField>
          <FormField label={FIELD_LABELS.affiliation} name="affiliation" optional state={state} hint="The university or board you are affiliated to, if any." className="sm:col-span-2">
            <Input maxLength={300} />
          </FormField>
        </div>
      </fieldset>

      <InstitutionDetailsFields state={state} countries={countries} industries={industries} />

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Placement contact</legend>
        <p className="text-sm text-muted-foreground">Shared with Venkat Sai staff and participating employers only, never shown publicly.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={FIELD_LABELS.placementOfficerName} name="placementOfficerName" optional state={state}>
            <Input maxLength={120} autoComplete="off" />
          </FormField>
          <FormField label={FIELD_LABELS.placementOfficerEmail} name="placementOfficerEmail" optional state={state}>
            <Input type="email" maxLength={254} autoComplete="off" />
          </FormField>
          <FormField label={FIELD_LABELS.placementOfficerPhone} name="placementOfficerPhone" optional state={state}>
            <Input type="tel" maxLength={24} autoComplete="off" />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Authorised representative</legend>
        <p className="text-sm text-muted-foreground">
          You will be the owner of this workspace and its authorised representative: <span className="font-medium text-foreground">{representativeName}</span>. You can
          invite instructors and colleagues once the workspace is created.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={FIELD_LABELS.representativeTitle} name="representativeTitle" required state={state} hint="For example Principal, Director or Training Manager.">
            <Input autoComplete="organization-title" maxLength={120} />
          </FormField>
        </div>
        <FormField label="I confirm I am authorised to register this institution on Venkat Sai Global" name="confirmAuthorised" required state={state} hideLabel>
          {(field) => (
            <div className="flex items-start gap-3">
              <input
                {...field}
                type="checkbox"
                value="true"
                className="mt-1 size-4 shrink-0 rounded border-input accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <label htmlFor={field.id} className="text-sm leading-6 text-foreground">
                I confirm I am authorised to register this institution on Venkat Sai Global, and that the details above are accurate. Venkat Sai checks them
                before the institution is verified.
              </label>
            </div>
          )}
        </FormField>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">You can change these details later from your institution profile.</p>
        <SubmitButton pending={pending} pendingLabel="Creating workspace…" size="lg">
          Create institution workspace
        </SubmitButton>
      </div>
    </form>
  );
}
