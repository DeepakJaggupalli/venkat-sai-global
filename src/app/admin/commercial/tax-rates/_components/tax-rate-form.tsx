"use client";

import { useRouter } from "next/navigation";

import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { CountrySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { confirmTaxRateAction, saveTaxRateAction } from "@/modules/commercial/actions";

import { CheckboxField } from "../../plans/_components/plan-form";

export type TaxRateDefaults = {
  id: string;
  name: string;
  countryCode: string;
  region: string | null;
  kind: string;
  ratePercent: string;
  taxCode: string | null;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  notes: string | null;
};

/** Create or edit a tax rate. Editing a rate clears its confirmation (finance confirms again). */
export function TaxRateForm({ rate, countries, canEdit }: { rate?: TaxRateDefaults; countries: SelectOption[]; canEdit: boolean }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useBillingForm<{ id: string }>(saveTaxRateAction as never, {
    refresh: Boolean(rate),
    onSuccess: (data) => {
      if (!rate && data?.id) router.push("/admin/commercial/tax-rates");
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label={rate ? "Edit tax rate" : "New tax rate"}>
      {rate ? <input type="hidden" name="id" value={rate.id} /> : null}
      <FormErrorAlert state={state} fieldLabels={{ name: "Name", countryCode: "Country", kind: "Kind", ratePercent: "Rate", taxCode: "SAC / HSN code", effectiveFrom: "Effective from", effectiveUntil: "Effective until" }} />
      <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Name" name="name" required state={state} hint="Printed on invoices, e.g. CGST or VAT.">
            <Input defaultValue={rate?.name ?? ""} maxLength={80} />
          </FormField>
          <FormField label="Kind" name="kind" required state={state}>
            {(field) => <SimpleSelect {...field} options={OPTIONS.taxKind} defaultValue={rate?.kind} placeholder="Choose" />}
          </FormField>
          <FormField label="Country" name="countryCode" required state={state}>
            {(field) => <CountrySelect {...field} options={countries} defaultValue={rate?.countryCode} placeholder="Choose" />}
          </FormField>
          <FormField label="Region" name="region" optional state={state} hint="State or region code, only for regional rates.">
            <Input defaultValue={rate?.region ?? ""} maxLength={10} />
          </FormField>
          <FormField label="Rate (%)" name="ratePercent" required state={state}>
            <Input defaultValue={rate?.ratePercent ?? ""} inputMode="decimal" maxLength={6} />
          </FormField>
          <FormField label="SAC / HSN code" name="taxCode" optional state={state} hint="Blank = applies to every code without a specific rate.">
            <Input defaultValue={rate?.taxCode ?? ""} maxLength={10} />
          </FormField>
          <FormField label="Effective from" name="effectiveFrom" required state={state}>
            <Input type="date" defaultValue={rate?.effectiveFrom ?? ""} />
          </FormField>
          <FormField label="Effective until" name="effectiveUntil" optional state={state} hint="Blank = no end date.">
            <Input type="date" defaultValue={rate?.effectiveUntil ?? ""} />
          </FormField>
        </div>
        <FormField label="Notes" name="notes" optional state={state}>
          <Textarea defaultValue={rate?.notes ?? ""} rows={2} maxLength={1000} />
        </FormField>
        <CheckboxField name="isActive" label="Active" defaultChecked={rate?.isActive ?? true} />
      </fieldset>
      {canEdit ? (
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {rate ? "Save rate" : "Create rate"}
        </SubmitButton>
      ) : null}
      {rate && canEdit ? <p className="text-xs text-muted-foreground">Saving changes clears the confirmation; confirm the rate again afterwards.</p> : null}
    </form>
  );
}

export function ConfirmTaxRateButton({ taxRateId, label }: { taxRateId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline" aria-label={`Confirm ${label}`}>
          Confirm
        </Button>
      }
      title={`Confirm ${label}?`}
      description="Confirm only after checking the rate, SAC/HSN code and effective dates with your tax adviser. Your name is recorded with the confirmation."
      confirmLabel="Confirm rate"
      onConfirm={async () => {
        const r = await confirmTaxRateAction({ taxRateId });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}
