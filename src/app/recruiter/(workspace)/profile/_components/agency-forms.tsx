"use client";

import { CheckGroup } from "@/components/recruiter/check-group";
import { OrganizationDetailsFields, ORGANIZATION_FIELD_LABELS, type OrganizationDetailsDefaults } from "@/components/recruiter/organization-details-fields";
import { useRecruiterForm } from "@/components/recruiter/use-form-action";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { updateOrganizationAction } from "@/modules/organizations/actions";
import { PARTNER_BUSINESS_TYPE_LABELS, PARTNER_BUSINESS_TYPES, PARTNER_SERVICE_LABELS, PARTNER_SERVICES } from "@/modules/organizations/constants";
import { updatePartnerProfileAction } from "@/modules/organizations/partner-actions";

/** Registered entity, address and official contact (identity fields lock while verification is pending or valid). */
export function AgencyDetailsForm({
  defaults,
  countries,
  industries,
  identityLocked,
}: {
  defaults: OrganizationDetailsDefaults;
  countries: SelectOption[];
  industries: SelectOption[];
  identityLocked: boolean;
}) {
  const { state, pending, onSubmit } = useRecruiterForm(updateOrganizationAction);
  useActionToast(state);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <input type="hidden" name="orgType" value="recruitment_partner" />
      <FormErrorAlert state={state} fieldLabels={ORGANIZATION_FIELD_LABELS} />
      <OrganizationDetailsFields state={state} countries={countries} industries={industries} defaults={defaults} identityLocked={identityLocked} />
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save agency details
        </SubmitButton>
      </div>
    </form>
  );
}

export type PartnerProfileDefaults = {
  businessType: string | null;
  servicesProvided: string[];
  yearsInOperation: number | null;
  specialisations: string[];
  industries: SelectOption[];
  placementsClaimed: number | null;
};

/** Business type, services and specialisations (overseas services need a verified licence once verified). */
export function PartnerProfileForm({ defaults, industries }: { defaults: PartnerProfileDefaults; industries: SelectOption[] }) {
  const { state, pending, onSubmit } = useRecruiterForm(updatePartnerProfileAction);
  useActionToast(state);
  const fe = state?.ok === false ? state.fieldErrors : undefined;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormErrorAlert
        state={state}
        fieldLabels={{ businessType: "Business type", servicesProvided: "Services", yearsInOperation: "Years in operation", specialisations: "Specialisations", industryIds: "Industries", placementsClaimed: "Placements so far" }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Business type" name="businessType" required state={state}>
          <SimpleSelect options={PARTNER_BUSINESS_TYPES.map((v) => ({ value: v, label: PARTNER_BUSINESS_TYPE_LABELS[v] }))} defaultValue={defaults.businessType ?? undefined} placeholder="Choose your business type" />
        </FormField>
        <FormField label="Years in operation" name="yearsInOperation" optional state={state}>
          <Input type="number" inputMode="numeric" min={0} max={200} defaultValue={defaults.yearsInOperation ?? undefined} />
        </FormField>
      </div>
      <CheckGroup
        name="servicesProvided"
        legend="Services you provide"
        hint="Visa processing, emigration clearance and pre-departure orientation are overseas recruitment services. A verified agency can only declare them with a verified recruitment licence."
        options={PARTNER_SERVICES.map((v) => ({ value: v, label: PARTNER_SERVICE_LABELS[v] }))}
        defaultValues={defaults.servicesProvided}
        errors={fe?.servicesProvided}
        columns={3}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Trades and specialisations" name="specialisations" optional state={state} hint="For example Welding, Scaffolding, Oil and gas. Press Enter after each.">
          {(field) => <TagInput {...field} name="specialisations" defaultValue={defaults.specialisations} placeholder="Add a specialisation" maxTags={20} maxLength={80} />}
        </FormField>
        <FormField label="Industries" name="industryIds" optional state={state}>
          {(field) => <MultiCombobox {...field} name="industryIds" options={industries} defaultValue={defaults.industries} placeholder="Choose industries" searchPlaceholder="Search industries" maxSelected={20} />}
        </FormField>
        <FormField label="Placements so far" name="placementsClaimed" optional state={state} hint="Self-declared. Seen by Venkat Sai only, never shown publicly.">
          <Input type="number" inputMode="numeric" min={0} defaultValue={defaults.placementsClaimed ?? undefined} />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save services
        </SubmitButton>
      </div>
    </form>
  );
}
