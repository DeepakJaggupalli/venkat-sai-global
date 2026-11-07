"use client";

import { useState } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { CountrySelect, CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBillingProfileAction, saveBillingProfileForStaffAction } from "@/modules/commercial/actions";

import { OPTIONS } from "./labels";
import type { BillingPortal } from "./portal-config";
import { useBillingForm } from "./use-billing-form";

export type BillingProfileDefaults = {
  legalName?: string | null;
  contactName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  stateCode?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  taxIdType?: string | null;
  taxId?: string | null;
  taxExempt?: boolean | null;
  taxExemptReason?: string | null;
  currency?: string | null;
};

type Props = {
  /** Portal members edit their own organisation; staff pass `organizationId`. */
  target: { portal: BillingPortal } | { organizationId: string };
  defaults: BillingProfileDefaults | null;
  countries: SelectOption[];
  currencies: SelectOption[];
  canEdit: boolean;
};

const FIELD_LABELS = {
  legalName: "Legal name",
  billingEmail: "Billing email",
  addressLine1: "Address",
  city: "City",
  stateCode: "GST state code",
  countryCode: "Country",
  taxIdType: "Tax number type",
  taxId: "Tax number",
  taxExemptReason: "Reason for exemption",
  currency: "Billing currency",
};

/** Legal name, tax number (GSTIN / VAT), address and state code printed on invoices. */
export function BillingProfileForm({ target, defaults, countries, currencies, canEdit }: Props) {
  const isStaff = "organizationId" in target;
  const { state, pending, onSubmit } = useBillingForm(isStaff ? saveBillingProfileForStaffAction : saveBillingProfileAction);
  const [country, setCountry] = useState(defaults?.countryCode ?? "");
  const [exempt, setExempt] = useState(Boolean(defaults?.taxExempt));
  const d = defaults ?? {};
  const india = country === "IN";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Billing details">
      {isStaff ? <input type="hidden" name="organizationId" value={target.organizationId} /> : <input type="hidden" name="portal" value={target.portal} />}
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Legal name" name="legalName" required state={state} hint="Exactly as registered; printed on invoices.">
            <Input defaultValue={d.legalName ?? ""} maxLength={200} autoComplete="organization" />
          </FormField>
          <FormField label="Contact name" name="contactName" optional state={state}>
            <Input defaultValue={d.contactName ?? ""} maxLength={120} autoComplete="name" />
          </FormField>
          <FormField label="Billing email" name="billingEmail" required state={state} hint="Invoices and payment receipts are sent here.">
            <Input type="email" defaultValue={d.billingEmail ?? ""} maxLength={254} autoComplete="email" />
          </FormField>
          <FormField label="Billing phone" name="billingPhone" optional state={state}>
            <Input type="tel" defaultValue={d.billingPhone ?? ""} maxLength={20} autoComplete="tel" />
          </FormField>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Address" name="addressLine1" required state={state}>
            <Input defaultValue={d.addressLine1 ?? ""} maxLength={200} autoComplete="address-line1" />
          </FormField>
          <FormField label="Address line 2" name="addressLine2" optional state={state}>
            <Input defaultValue={d.addressLine2 ?? ""} maxLength={200} autoComplete="address-line2" />
          </FormField>
          <FormField label="City" name="city" required state={state}>
            <Input defaultValue={d.city ?? ""} maxLength={100} autoComplete="address-level2" />
          </FormField>
          <FormField label="State or region" name="stateRegion" optional state={state}>
            <Input defaultValue={d.stateRegion ?? ""} maxLength={100} autoComplete="address-level1" />
          </FormField>
          <FormField label="Postal code" name="postalCode" optional state={state}>
            <Input defaultValue={d.postalCode ?? ""} maxLength={20} autoComplete="postal-code" />
          </FormField>
          <FormField label="Country" name="countryCode" required state={state}>
            {(field) => <CountrySelect {...field} options={countries} defaultValue={d.countryCode ?? undefined} onValueChange={setCountry} placeholder="Choose a country" />}
          </FormField>
          {india ? (
            <FormField label="GST state code" name="stateCode" required state={state} hint="Place of supply, for example 37 for Andhra Pradesh.">
              {(field) => <SimpleSelect {...field} options={OPTIONS.gstState} defaultValue={d.stateCode ?? undefined} placeholder="Choose a state" />}
            </FormField>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {!india ? (
            <FormField label="Tax number type" name="taxIdType" optional state={state}>
              {(field) => <SimpleSelect {...field} options={OPTIONS.taxIdType.filter((o) => o.value !== "gstin")} defaultValue={d.taxIdType ?? undefined} allowClear placeholder="None" />}
            </FormField>
          ) : null}
          <FormField
            label={india ? "GSTIN" : "Tax number"}
            name="taxId"
            optional
            state={state}
            hint={india ? "15 characters. Leave blank if your organisation is not GST-registered." : "VAT, TRN or similar, if registered."}
          >
            <Input defaultValue={d.taxId ?? ""} maxLength={30} className="uppercase" autoComplete="off" />
          </FormField>
          <FormField label="Billing currency" name="currency" required state={state} hint="Used for new invoices and to show plan prices.">
            {(field) => <CurrencySelect {...field} options={currencies} defaultValue={d.currency ?? undefined} placeholder="Choose a currency" />}
          </FormField>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Checkbox id="taxExempt" name="taxExempt" defaultChecked={exempt} onCheckedChange={(v) => setExempt(v === true)} />
            <div>
              <Label htmlFor="taxExempt">The organisation is exempt from tax</Label>
              <p className="text-sm text-muted-foreground">For example an SEZ unit supplying under a Letter of Undertaking. Our finance team may ask for proof.</p>
            </div>
          </div>
          {exempt ? (
            <FormField label="Reason for exemption" name="taxExemptReason" required state={state}>
              <Textarea defaultValue={d.taxExemptReason ?? ""} maxLength={300} rows={2} />
            </FormField>
          ) : null}
        </div>
      </fieldset>
      {canEdit ? (
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save billing details
        </SubmitButton>
      ) : (
        <p className="text-sm text-muted-foreground">You can view these details. Ask a colleague with billing access to change them.</p>
      )}
    </form>
  );
}
