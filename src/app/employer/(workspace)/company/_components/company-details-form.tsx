"use client";

import { OrganizationDetailsFields, ORGANIZATION_FIELD_LABELS, type OrganizationDetailsDefaults } from "@/components/employer/organization-details-fields";
import { useEmployerForm } from "@/components/employer/use-form-action";
import { FormErrorAlert, SubmitButton, useActionToast } from "@/components/shared/form";
import type { SelectOption } from "@/components/shared/types";

import { updateCompanyDetailsAction } from "../actions";

export function CompanyDetailsForm({
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
  const { state, pending, onSubmit } = useEmployerForm(updateCompanyDetailsAction);
  useActionToast(state);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormErrorAlert state={state} fieldLabels={ORGANIZATION_FIELD_LABELS} />
      <OrganizationDetailsFields state={state} defaults={defaults} countries={countries} industries={industries} identityLocked={identityLocked} />
      <div className="flex justify-end border-t border-border pt-4">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save company details
        </SubmitButton>
      </div>
    </form>
  );
}
