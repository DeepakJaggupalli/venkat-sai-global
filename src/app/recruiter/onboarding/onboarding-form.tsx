"use client";

import { useEffect, useRef } from "react";

import { CheckGroup } from "@/components/recruiter/check-group";
import { OrganizationDetailsFields, ORGANIZATION_FIELD_LABELS } from "@/components/recruiter/organization-details-fields";
import { useRecruiterForm } from "@/components/recruiter/use-form-action";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { track } from "@/modules/analytics/client";
import { PARTNER_BUSINESS_TYPE_LABELS, PARTNER_BUSINESS_TYPES, PARTNER_SERVICE_LABELS, PARTNER_SERVICES, PARTNER_TERRITORY_SCOPE_LABELS, PARTNER_TERRITORY_SCOPES } from "@/modules/organizations/constants";

import { createPartnerOrganizationAction } from "./actions";

const FIELD_LABELS = {
  ...ORGANIZATION_FIELD_LABELS,
  businessType: "Business type",
  servicesProvided: "Services",
  yearsInOperation: "Years in operation",
  territoryCountries: "Countries",
  territoryScope: "What you do there",
  representativeTitle: "Your designation",
  confirmAuthorised: "Authorisation confirmation",
  confirmNoCandidateFees: "No candidate fees confirmation",
};

function Confirm({ name, label, state, children }: { name: string; label: string; state: Parameters<typeof FormField>[0]["state"]; children: React.ReactNode }) {
  return (
    <FormField label={label} name={name} required state={state} hideLabel>
      {(field) => (
        <div className="flex items-start gap-3">
          <input
            {...field}
            type="checkbox"
            value="true"
            className="mt-1 size-4 shrink-0 rounded border-input accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <label htmlFor={field.id} className="text-sm leading-6 text-foreground">
            {children}
          </label>
        </div>
      )}
    </FormField>
  );
}

export function PartnerOnboardingForm({ countries, industries, representativeName }: { countries: SelectOption[]; industries: SelectOption[]; representativeName: string }) {
  const { state, pending, onSubmit } = useRecruiterForm(createPartnerOrganizationAction);
  useActionToast(state);
  const started = useRef(false);
  const fe = state?.ok === false ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok === false) track("error_shown", { formId: "partner_onboarding" });
  }, [state]);

  return (
    <form
      onSubmit={(event) => {
        track("recruiter_application_submitted", { formId: "partner_onboarding" });
        onSubmit(event);
      }}
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        track("recruiter_registration_started", { formId: "partner_onboarding" });
      }}
      noValidate
      className="space-y-8"
      aria-describedby="onboarding-intro"
    >
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <OrganizationDetailsFields state={state} countries={countries} industries={industries} />

      <fieldset className="space-y-5">
        <legend className="font-heading text-base font-semibold text-foreground">Business and services</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Business type" name="businessType" required state={state}>
            <SimpleSelect options={PARTNER_BUSINESS_TYPES.map((v) => ({ value: v, label: PARTNER_BUSINESS_TYPE_LABELS[v] }))} placeholder="Choose your business type" />
          </FormField>
          <FormField label="Years in operation" name="yearsInOperation" optional state={state}>
            <Input type="number" inputMode="numeric" min={0} max={200} />
          </FormField>
        </div>
        <CheckGroup
          name="servicesProvided"
          legend="Services you provide"
          hint="Visa processing, emigration clearance and pre-departure orientation count as overseas recruitment services and need a recruitment licence."
          options={PARTNER_SERVICES.map((v) => ({ value: v, label: PARTNER_SERVICE_LABELS[v] }))}
          defaultValues={["candidate_sourcing"]}
          errors={fe?.servicesProvided}
          columns={3}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Where you work</legend>
        <p className="text-sm text-muted-foreground">
          Declare the countries where you source candidates or support placements. Venkat Sai authorises each territory after checking that your licences cover it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Countries" name="territoryCountries" optional state={state} hint="Up to 30. You can add states or regions later.">
            {(field) => <MultiCombobox {...field} name="territoryCountries" options={countries} placeholder="Choose countries" searchPlaceholder="Search countries" maxSelected={30} />}
          </FormField>
          <FormField label="What you do there" name="territoryScope" state={state}>
            <SimpleSelect options={PARTNER_TERRITORY_SCOPES.map((v) => ({ value: v, label: PARTNER_TERRITORY_SCOPE_LABELS[v] }))} defaultValue="sourcing" />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Contact person</legend>
        <p className="text-sm text-muted-foreground">
          You will own this workspace and be the agency&apos;s contact person: <span className="font-medium text-foreground">{representativeName}</span>. Invite colleagues from
          the team page once the workspace is created.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Your designation" name="representativeTitle" required state={state} hint="For example Proprietor, Director or Recruitment Manager.">
            <Input autoComplete="organization-title" maxLength={120} />
          </FormField>
        </div>
        <Confirm name="confirmAuthorised" label="I am authorised to register this agency" state={state}>
          I confirm I am authorised to register this agency on Venkat Sai Global and that the details above are accurate. Venkat Sai checks them before the agency is
          verified.
        </Confirm>
        <Confirm name="confirmNoCandidateFees" label="Candidates are never charged" state={state}>
          I confirm that my agency will never charge a candidate any fee for being submitted, interviewed, trade-tested or placed through Venkat Sai Global. Employers pay
          for recruitment.
        </Confirm>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Next you will add your licences, upload registration documents and accept the partner agreement.</p>
        <SubmitButton pending={pending} pendingLabel="Creating workspace…" size="lg">
          Create partner workspace
        </SubmitButton>
      </div>
    </form>
  );
}
