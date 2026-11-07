"use client";

import { FormField } from "@/components/shared/form";
import { CountrySelect, SearchableSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions";

export type OrganizationDetailsDefaults = {
  name?: string | null;
  legalName?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  industryId?: string | null;
  countryCode?: string | null;
  stateRegion?: string | null;
  city?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  registrationNumber?: string | null;
  taxId?: string | null;
};

export const ORGANIZATION_FIELD_LABELS = {
  name: "Company name",
  legalName: "Registered (legal) name",
  websiteUrl: "Website",
  countryCode: "Country of registration",
  stateRegion: "State / region",
  city: "City",
  addressLine1: "Registered address",
  addressLine2: "Address line 2",
  postalCode: "Postal code",
  industryId: "Industry",
  description: "Short description",
  registrationNumber: "Registration number",
  taxId: "Tax ID (GSTIN, VAT, TRN)",
  email: "Official email",
  phone: "Official phone",
} as const;

const v = (value: string | null | undefined) => value ?? undefined;

/**
 * Organisation identity, address and registration fields shared by onboarding and the company page.
 * `identityLocked`: while verification is pending or granted, members cannot change name, legal name,
 * registration number, tax id or country (the service enforces it; the form explains it).
 */
export function OrganizationDetailsFields({
  state,
  defaults = {},
  countries,
  industries,
  identityLocked = false,
}: {
  state: ActionState<unknown>;
  defaults?: OrganizationDetailsDefaults;
  countries: SelectOption[];
  industries: SelectOption[];
  identityLocked?: boolean;
}) {
  const lockedHint = identityLocked ? "Locked while your verification is pending or valid. Contact Venkat Sai support to change it." : undefined;
  const L = ORGANIZATION_FIELD_LABELS;
  return (
    <div className="space-y-8">
      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Company identity</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={L.name} name="name" required state={state} hint={lockedHint ?? "The name candidates and partners will see."}>
            <Input defaultValue={v(defaults.name)} autoComplete="organization" readOnly={identityLocked} maxLength={200} />
          </FormField>
          <FormField label={L.legalName} name="legalName" optional state={state} hint={lockedHint ?? "As printed on your registration certificate."}>
            <Input defaultValue={v(defaults.legalName)} readOnly={identityLocked} maxLength={200} />
          </FormField>
          <FormField label={L.industryId} name="industryId" optional state={state}>
            <SearchableSelect options={industries} defaultValue={v(defaults.industryId)} placeholder="Choose an industry" allowClear clearLabel="No industry" />
          </FormField>
          <FormField label={L.websiteUrl} name="websiteUrl" optional state={state} hint="Starting with https://">
            <Input type="url" inputMode="url" defaultValue={v(defaults.websiteUrl)} placeholder="https://" autoComplete="url" />
          </FormField>
        </div>
        <FormField label={L.description} name="description" optional state={state} hint="What your company does and where it operates (up to 2,000 characters).">
          <Textarea defaultValue={v(defaults.description)} rows={4} maxLength={2000} />
        </FormField>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Registered address</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={L.countryCode} name="countryCode" required state={state} hint={lockedHint}>
            {(field) =>
              identityLocked ? (
                <>
                  <Input id={field.id} value={countries.find((c) => c.value === defaults.countryCode)?.label ?? defaults.countryCode ?? ""} readOnly aria-describedby={field["aria-describedby"]} />
                  <input type="hidden" name="countryCode" value={defaults.countryCode ?? ""} />
                </>
              ) : (
                <CountrySelect {...field} options={countries} defaultValue={v(defaults.countryCode)} placeholder="Choose a country" />
              )
            }
          </FormField>
          <FormField label={L.stateRegion} name="stateRegion" optional state={state}>
            <Input defaultValue={v(defaults.stateRegion)} autoComplete="address-level1" maxLength={120} />
          </FormField>
          <FormField label={L.city} name="city" state={state} hint="Needed for verification.">
            <Input defaultValue={v(defaults.city)} autoComplete="address-level2" maxLength={120} />
          </FormField>
          <FormField label={L.postalCode} name="postalCode" optional state={state}>
            <Input defaultValue={v(defaults.postalCode)} autoComplete="postal-code" maxLength={20} />
          </FormField>
          <FormField label={L.addressLine1} name="addressLine1" state={state} className="sm:col-span-2">
            <Input defaultValue={v(defaults.addressLine1)} autoComplete="address-line1" maxLength={200} />
          </FormField>
          <FormField label={L.addressLine2} name="addressLine2" optional state={state} className="sm:col-span-2">
            <Input defaultValue={v(defaults.addressLine2)} autoComplete="address-line2" maxLength={200} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Registration and official contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={L.registrationNumber} name="registrationNumber" optional state={state} hint={lockedHint ?? "Company / trade licence number."}>
            <Input defaultValue={v(defaults.registrationNumber)} readOnly={identityLocked} maxLength={100} />
          </FormField>
          <FormField label={L.taxId} name="taxId" optional state={state} hint={lockedHint}>
            <Input defaultValue={v(defaults.taxId)} readOnly={identityLocked} maxLength={50} />
          </FormField>
          <FormField label={L.email} name="email" state={state} hint="A company address. An official email or phone is needed for verification.">
            <Input type="email" defaultValue={v(defaults.email)} autoComplete="email" maxLength={254} />
          </FormField>
          <FormField label={L.phone} name="phone" optional state={state} hint="Include the country code, for example +91 98480 12345.">
            <Input type="tel" defaultValue={v(defaults.phone)} autoComplete="tel" maxLength={24} />
          </FormField>
        </div>
      </fieldset>
    </div>
  );
}
