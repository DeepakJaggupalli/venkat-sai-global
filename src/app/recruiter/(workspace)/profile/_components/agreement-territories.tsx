"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useRecruiterForm } from "@/components/recruiter/use-form-action";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { CountrySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PARTNER_TERRITORY_SCOPE_LABELS, PARTNER_TERRITORY_SCOPES } from "@/modules/organizations/constants";
import { acceptPartnerAgreementAction, addPartnerTerritoryAction, removePartnerTerritoryAction } from "@/modules/organizations/partner-actions";

/** Electronic acceptance: typed full name + confirmation. The service records time, hashed IP and user agent. */
export function AcceptAgreementForm({ agreementId, version, defaultName }: { agreementId: string; version: string; defaultName: string }) {
  const { state, pending, onSubmit } = useRecruiterForm(acceptPartnerAgreementAction);
  useActionToast(state);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-lg border border-border bg-surface-subtle p-4">
      <input type="hidden" name="agreementId" value={agreementId} />
      <FormErrorAlert state={state} fieldLabels={{ acceptedByName: "Your full name", confirm: "Confirmation" }} />
      <FormField label="Your full name" name="acceptedByName" required state={state} hint="Typing your name is your electronic signature on behalf of the agency.">
        <Input defaultValue={defaultName} autoComplete="name" maxLength={120} />
      </FormField>
      <FormField label="I accept the agreement" name="confirm" required state={state} hideLabel>
        {(field) => (
          <div className="flex items-start gap-3">
            <input {...field} type="checkbox" value="true" className="mt-1 size-4 shrink-0 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <label htmlFor={field.id} className="text-sm leading-6 text-foreground">
              I have read version {version} of the partner agreement and accept it on behalf of my agency. I am authorised to do so.
            </label>
          </div>
        )}
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Recording acceptance…">
          Accept agreement
        </SubmitButton>
      </div>
    </form>
  );
}

export function TerritoryForm({ countries }: { countries: SelectOption[] }) {
  const { state, pending, onSubmit } = useRecruiterForm(addPartnerTerritoryAction);
  const [formKey, setFormKey] = useState(0);
  const last = useRef(state);
  useActionToast(state);
  useEffect(() => {
    if (state !== last.current && state?.ok) setFormKey((k) => k + 1);
    last.current = state;
  }, [state]);
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormErrorAlert state={state} fieldLabels={{ countryCode: "Country", stateRegion: "State or region", scope: "What you do there" }} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Country" name="countryCode" required state={state}>
          {(field) => <CountrySelect {...field} options={countries} />}
        </FormField>
        <FormField label="State or region" name="stateRegion" optional state={state} hint="Leave empty for the whole country.">
          <Input maxLength={120} />
        </FormField>
        <FormField label="What you do there" name="scope" required state={state}>
          <SimpleSelect options={PARTNER_TERRITORY_SCOPES.map((v) => ({ value: v, label: PARTNER_TERRITORY_SCOPE_LABELS[v] }))} defaultValue="sourcing" />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Adding…" variant="outline">
          Add territory
        </SubmitButton>
      </div>
    </form>
  );
}

export function RemoveTerritoryButton({ territoryId, label }: { territoryId: string; label: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Remove territory ${label}`}>
          <Trash2 aria-hidden="true" /> Remove
        </Button>
      }
      title={`Remove ${label}?`}
      description="Venkat Sai will no longer assign requirements to you for this territory."
      confirmLabel="Remove territory"
      variant="destructive"
      onConfirm={() => removePartnerTerritoryAction({ territoryId })}
    />
  );
}
