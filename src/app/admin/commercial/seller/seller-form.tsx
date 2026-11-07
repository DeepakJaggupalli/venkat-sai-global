"use client";

import { useState } from "react";

import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { CountrySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { saveSellerDetailsAction } from "./actions";

export type SellerDefaults = {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  countryCode: string;
  stateCode: string;
  taxId: string;
  email: string;
  phone: string;
  paymentInstructions: string;
};

/** Seller identity printed on every invoice issued from now on. */
export function SellerForm({ defaults, countries, canEdit }: { defaults: SellerDefaults; countries: SelectOption[]; canEdit: boolean }) {
  const { state, pending, onSubmit } = useBillingForm(saveSellerDetailsAction);
  const [country, setCountry] = useState(defaults.countryCode);
  const india = country === "IN";
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Seller details">
      <FormErrorAlert state={state} fieldLabels={{ legalName: "Legal name", addressLine1: "Address", city: "City", countryCode: "Country", stateCode: "GST state code", taxId: "GSTIN", email: "Email" }} />
      <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Legal name" name="legalName" required state={state}>
            <Input defaultValue={defaults.legalName} maxLength={200} />
          </FormField>
          <FormField label={india ? "GSTIN" : "Tax number"} name="taxId" optional state={state} hint={india ? "Leave blank if the business is not GST-registered: no GST is charged and documents are titled “Invoice”." : undefined}>
            <Input defaultValue={defaults.taxId} maxLength={30} className="uppercase" autoComplete="off" />
          </FormField>
          <FormField label="Address" name="addressLine1" required state={state}>
            <Input defaultValue={defaults.addressLine1} maxLength={200} />
          </FormField>
          <FormField label="Address line 2" name="addressLine2" optional state={state}>
            <Input defaultValue={defaults.addressLine2} maxLength={200} />
          </FormField>
          <FormField label="City" name="city" required state={state}>
            <Input defaultValue={defaults.city} maxLength={100} />
          </FormField>
          <FormField label="State or region" name="stateRegion" optional state={state}>
            <Input defaultValue={defaults.stateRegion} maxLength={100} />
          </FormField>
          <FormField label="Postal code" name="postalCode" optional state={state}>
            <Input defaultValue={defaults.postalCode} maxLength={20} />
          </FormField>
          <FormField label="Country" name="countryCode" required state={state}>
            {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.countryCode} onValueChange={setCountry} />}
          </FormField>
          {india ? (
            <FormField label="GST state code" name="stateCode" required state={state} hint="Decides CGST + SGST (same state) or IGST (other states).">
              {(field) => <SimpleSelect {...field} options={OPTIONS.gstState} defaultValue={defaults.stateCode || undefined} placeholder="Choose a state" />}
            </FormField>
          ) : null}
          <FormField label="Billing email" name="email" optional state={state}>
            <Input type="email" defaultValue={defaults.email} maxLength={254} />
          </FormField>
          <FormField label="Billing phone" name="phone" optional state={state}>
            <Input type="tel" defaultValue={defaults.phone} maxLength={30} />
          </FormField>
        </div>
        <FormField
          label="Payment instructions"
          name="paymentInstructions"
          optional
          state={state}
          hint="Printed on unpaid invoices for offline payment: bank account name, number, IFSC, UPI ID. Enter only real, verified details."
        >
          <Textarea defaultValue={defaults.paymentInstructions} rows={5} maxLength={2000} />
        </FormField>
      </fieldset>
      {canEdit ? (
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save seller details
        </SubmitButton>
      ) : null}
    </form>
  );
}
