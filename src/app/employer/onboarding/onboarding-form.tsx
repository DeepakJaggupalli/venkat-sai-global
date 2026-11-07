"use client";

import { useEffect, useRef } from "react";

import { OrganizationDetailsFields, ORGANIZATION_FIELD_LABELS } from "@/components/employer/organization-details-fields";
import { useEmployerForm } from "@/components/employer/use-form-action";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { track } from "@/modules/analytics/client";

import { createEmployerOrganizationAction } from "./actions";

export function EmployerOnboardingForm({
  countries,
  industries,
  representativeName,
  defaultEmail,
}: {
  countries: SelectOption[];
  industries: SelectOption[];
  representativeName: string;
  defaultEmail?: string;
}) {
  const { state, pending, onSubmit } = useEmployerForm(createEmployerOrganizationAction);
  useActionToast(state);
  const started = useRef(false);

  useEffect(() => {
    if (state?.ok === false) track("error_shown", { formId: "employer_onboarding" });
  }, [state]);

  return (
    <form
      onSubmit={(event) => {
        track("form_submitted", { formId: "employer_onboarding" });
        onSubmit(event);
      }}
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        track("form_started", { formId: "employer_onboarding" });
      }}
      noValidate
      className="space-y-8"
      aria-describedby="onboarding-intro"
    >
      <FormErrorAlert
        state={state}
        fieldLabels={{ ...ORGANIZATION_FIELD_LABELS, representativeTitle: "Your designation", confirmAuthorised: "Authorisation confirmation" }}
      />
      <OrganizationDetailsFields state={state} countries={countries} industries={industries} defaults={{ email: defaultEmail }} />

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Authorised representative</legend>
        <p className="text-sm text-muted-foreground">
          You will be the owner of this workspace and its authorised representative: <span className="font-medium text-foreground">{representativeName}</span>. You can
          invite your team once the workspace is created.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Your designation" name="representativeTitle" required state={state} hint="For example HR Manager, Director or Proprietor.">
            <Input autoComplete="organization-title" maxLength={120} />
          </FormField>
        </div>
        <FormField label="I confirm I am authorised to register this company on Venkat Sai Global" name="confirmAuthorised" required state={state} hideLabel>
          {(field) => (
            <div className="flex items-start gap-3">
              <input
                {...field}
                type="checkbox"
                value="true"
                className="mt-1 size-4 shrink-0 rounded border-input accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <label htmlFor={field.id} className="text-sm leading-6 text-foreground">
                I confirm I am authorised to register this company on Venkat Sai Global, and that the details above are accurate. Venkat Sai checks them before
                the company is verified.
              </label>
            </div>
          )}
        </FormField>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">You can review and change these details later from your company profile.</p>
        <SubmitButton pending={pending} pendingLabel="Creating workspace…" size="lg">
          Create employer workspace
        </SubmitButton>
      </div>
    </form>
  );
}
