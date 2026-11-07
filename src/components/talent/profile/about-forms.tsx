"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { CountrySelect, CurrencySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FileSummary } from "@/modules/files/types";

import { CheckboxField, CheckboxGroup, FieldGrid } from "../fields";
import { enumOptions } from "../labels";
import { useTalentForm, useTalentMessages } from "../use-talent-action";
import { useDialogClose } from "./dialog";
import { FormFooterBar, type FormAction } from "./form-footer";

export type { FormAction };


// ---------------------------------------------------------------------------
// Personal details
// ---------------------------------------------------------------------------

export type PersonalDefaults = {
  legalName: string | null;
  gender: string | null;
  genderSelfDescription: string | null;
  nationalityCode: string | null;
  currentCountryCode: string | null;
  stateRegion: string | null;
  city: string | null;
  passportStatus: string | null;
  passportNumberLast4: string | null;
  passportExpiry: string | null;
  emigrationCheckStatus: string | null;
};

export function PersonalForm({ action, defaults, countries, minor }: { action: FormAction; defaults: PersonalDefaults; countries: SelectOption[]; minor: boolean }) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const [gender, setGender] = useState(defaults.gender ?? "");
  const [passport, setPassport] = useState(defaults.passportStatus ?? "");
  const hasNumber = passport === "valid" || passport === "expired";
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      <FieldGrid>
        <FormField label={t("field.legalName")} name="legalName" state={state} hint={t("field.legalName.hint")}>
          <Input defaultValue={defaults.legalName ?? ""} maxLength={150} autoComplete="name" />
        </FormField>
        <FormField label={t("field.nationality")} name="nationalityCode" state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.nationalityCode ?? undefined} placeholder={t("form.selectCountry")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.gender")} name="gender" state={state} hint={t("field.gender.hint")}>
          {(field) => <SimpleSelect {...field} options={enumOptions(t, "gender")} value={gender} onValueChange={setGender} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        {gender === "self_described" ? (
          <FormField label={t("field.genderSelfDescription")} name="genderSelfDescription" state={state}>
            <Input defaultValue={defaults.genderSelfDescription ?? ""} maxLength={60} />
          </FormField>
        ) : null}
      </FieldGrid>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t("section.location")}</legend>
        <FieldGrid>
          <FormField label={t("field.country")} name="currentCountryCode" state={state}>
            {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.currentCountryCode ?? undefined} placeholder={t("form.selectCountry")} allowClear clearLabel={t("form.notSet")} />}
          </FormField>
          <FormField label={t("field.state")} name="stateRegion" state={state}>
            <Input defaultValue={defaults.stateRegion ?? ""} maxLength={120} autoComplete="address-level1" />
          </FormField>
          <FormField label={t("field.city")} name="city" state={state}>
            <Input defaultValue={defaults.city ?? ""} maxLength={120} autoComplete="address-level2" />
          </FormField>
        </FieldGrid>
      </fieldset>
      {minor ? null : (
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">{t("section.passport")}</legend>
          <p className="text-sm text-muted-foreground">{t("field.passport.purpose")}</p>
          <FieldGrid>
            <FormField label={t("field.passportStatus")} name="passportStatus" state={state}>
              {(field) => <SimpleSelect {...field} options={enumOptions(t, "passportStatus")} value={passport} onValueChange={setPassport} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
            </FormField>
            <FormField label={t("field.emigration")} name="emigrationCheckStatus" state={state} hint={t("field.emigration.hint")}>
              {(field) => <SimpleSelect {...field} options={enumOptions(t, "emigration")} defaultValue={defaults.emigrationCheckStatus ?? undefined} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
            </FormField>
            {hasNumber ? (
              <>
                <FormField
                  label={t("field.passportNumber")}
                  name="passportNumber"
                  state={state}
                  hint={defaults.passportNumberLast4 ? t("field.passportNumber.stored", { last4: defaults.passportNumberLast4 }) : t("field.passportNumber.hint")}
                >
                  <Input autoComplete="off" spellCheck={false} maxLength={40} />
                </FormField>
                <FormField label={t("field.passportExpiry")} name="passportExpiry" state={state}>
                  <Input type="date" defaultValue={defaults.passportExpiry ?? ""} />
                </FormField>
              </>
            ) : null}
          </FieldGrid>
          {hasNumber && defaults.passportNumberLast4 ? <CheckboxField name="clearPassportNumber" label={t("field.passportNumber.clear")} /> : null}
        </fieldset>
      )}
      <FormFooterBar close={close} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Professional summary
// ---------------------------------------------------------------------------

export type ProfessionalDefaults = {
  headline: string | null;
  about: string | null;
  careerObjective: string | null;
  experienceLevel: string | null;
  totalExperienceMonths: number | null;
  currentJobTitle: string | null;
  currentEmployerName: string | null;
  industryId: string | null;
  noticePeriodDays: number | null;
  suggestedExperienceMonths: number;
};

export function ProfessionalForm({ action, defaults, industries }: { action: FormAction; defaults: ProfessionalDefaults; industries: SelectOption[] }) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const months = defaults.totalExperienceMonths;
  const suggested = defaults.suggestedExperienceMonths;
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      <FormField label={t("field.headline")} name="headline" state={state} hint={t("field.headline.hint")}>
        <Input defaultValue={defaults.headline ?? ""} maxLength={120} />
      </FormField>
      <FormField label={t("field.about")} name="about" state={state} hint={t("field.about.hint")}>
        <Textarea defaultValue={defaults.about ?? ""} maxLength={3000} rows={5} />
      </FormField>
      <FormField label={t("field.objective")} name="careerObjective" state={state}>
        <Textarea defaultValue={defaults.careerObjective ?? ""} maxLength={1000} rows={3} />
      </FormField>
      <FieldGrid>
        <FormField label={t("field.experienceLevel")} name="experienceLevel" state={state}>
          {(field) => <SimpleSelect {...field} options={enumOptions(t, "experienceLevel")} defaultValue={defaults.experienceLevel ?? undefined} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.industry")} name="industryId" state={state}>
          {(field) => <SearchableSelect {...field} options={industries} defaultValue={defaults.industryId ?? undefined} placeholder={t("form.select")} searchPlaceholder={t("form.search")} emptyText={t("form.noMatches")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.experienceYears")} name="experienceYears" state={state} hint={suggested > 0 ? t("field.experience.suggested", { years: Math.floor(suggested / 12), months: suggested % 12 }) : undefined}>
          <Input type="number" inputMode="numeric" min={0} max={60} defaultValue={months === null ? undefined : Math.floor(months / 12)} />
        </FormField>
        <FormField label={t("field.experienceMonths")} name="experienceExtraMonths" state={state}>
          <Input type="number" inputMode="numeric" min={0} max={11} defaultValue={months === null ? undefined : months % 12} />
        </FormField>
        <FormField label={t("field.currentJobTitle")} name="currentJobTitle" state={state}>
          <Input defaultValue={defaults.currentJobTitle ?? ""} maxLength={120} autoComplete="organization-title" />
        </FormField>
        <FormField label={t("field.currentEmployer")} name="currentEmployerName" state={state} hint={t("field.currentEmployer.hint")}>
          <Input defaultValue={defaults.currentEmployerName ?? ""} maxLength={150} autoComplete="organization" />
        </FormField>
        <FormField label={t("field.noticePeriod")} name="noticePeriodDays" state={state}>
          <Input type="number" inputMode="numeric" min={0} max={365} defaultValue={defaults.noticePeriodDays ?? undefined} />
        </FormField>
      </FieldGrid>
      <FormFooterBar close={close} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Job preferences
// ---------------------------------------------------------------------------

export type PreferencesDefaults = {
  preferredCategories: SelectOption[];
  preferredRoles: string[];
  desiredEmploymentTypes: string[];
  preferredWorkModes: string[];
  availability: string | null;
  availableFrom: string | null;
  expectedSalaryAmount: number | null;
  expectedSalaryCurrency: string | null;
  expectedSalaryPeriod: string | null;
  willingToRelocate: boolean;
  openToOverseas: boolean;
};

export function PreferencesForm({
  action,
  defaults,
  categories,
  currencies,
  minor,
}: {
  action: FormAction;
  defaults: PreferencesDefaults;
  categories: SelectOption[];
  currencies: SelectOption[];
  minor: boolean;
}) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      <FormField label={t("field.preferredCategories")} name="preferredCategoryIds" state={state} hint={t("field.preferredCategories.hint")}>
        {(field) => (
          <MultiCombobox {...field} options={categories} defaultValue={defaults.preferredCategories} maxSelected={10} placeholder={t("form.selectCategories")} searchPlaceholder={t("form.search")} emptyText={t("form.noMatches")} />
        )}
      </FormField>
      <FormField label={t("field.preferredRoles")} name="preferredRoles" state={state} hint={t("field.preferredRoles.hint")}>
        {(field) => <TagInput {...field} defaultValue={defaults.preferredRoles} maxTags={10} maxLength={80} placeholder={t("field.preferredRoles.placeholder")} />}
      </FormField>
      <CheckboxGroup name="desiredEmploymentTypes" legend={t("field.employmentTypes")} options={enumOptions(t, "employmentType")} defaultValue={defaults.desiredEmploymentTypes} state={state} columns={3} />
      <CheckboxGroup name="preferredWorkModes" legend={t("field.workModes")} options={enumOptions(t, "workMode")} defaultValue={defaults.preferredWorkModes} state={state} columns={3} />
      <FieldGrid>
        <FormField label={t("field.availability")} name="availability" state={state}>
          {(field) => <SimpleSelect {...field} options={enumOptions(t, "availability")} defaultValue={defaults.availability ?? undefined} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.availableFrom")} name="availableFrom" state={state}>
          <Input type="date" defaultValue={defaults.availableFrom ?? ""} />
        </FormField>
      </FieldGrid>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("field.expectedSalary")}</legend>
        <p className="text-sm text-muted-foreground">{t("field.expectedSalary.hint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t("field.amount")} name="expectedSalaryAmount" state={state}>
            <Input type="number" inputMode="decimal" min={0} step="any" defaultValue={defaults.expectedSalaryAmount ?? undefined} />
          </FormField>
          <FormField label={t("field.currency")} name="expectedSalaryCurrency" state={state}>
            {(field) => <CurrencySelect {...field} options={currencies} defaultValue={defaults.expectedSalaryCurrency ?? undefined} placeholder={t("form.selectCurrency")} allowClear clearLabel={t("form.notSet")} />}
          </FormField>
          <FormField label={t("field.period")} name="expectedSalaryPeriod" state={state}>
            {(field) => <SimpleSelect {...field} options={enumOptions(t, "salaryPeriod")} defaultValue={defaults.expectedSalaryPeriod ?? undefined} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
          </FormField>
        </div>
      </fieldset>
      <div className="space-y-3">
        <CheckboxField name="willingToRelocate" defaultChecked={defaults.willingToRelocate} label={t("field.willingToRelocate")} />
        {minor ? (
          <p className="text-sm text-muted-foreground">{t("profile.overseasMinor")}</p>
        ) : (
          <CheckboxField name="openToOverseas" defaultChecked={defaults.openToOverseas} label={t("field.openToOverseas")} hint={t("field.openToOverseas.hint")} />
        )}
      </div>
      <FormFooterBar close={close} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Preferred work locations (list editor → locations:json)
// ---------------------------------------------------------------------------

type LocationDraft = { key: number; countryCode: string; stateRegion: string; city: string };

export function LocationsForm({
  action,
  defaults,
  countries,
}: {
  action: FormAction;
  defaults: { countryCode: string; stateRegion: string | null; city: string | null }[];
  countries: SelectOption[];
}) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const [rows, setRows] = useState<LocationDraft[]>(() => defaults.map((d, i) => ({ key: i, countryCode: d.countryCode, stateRegion: d.stateRegion ?? "", city: d.city ?? "" })));
  const [nextKey, setNextKey] = useState(defaults.length);
  const payload = rows.filter((r) => r.countryCode).map(({ countryCode, stateRegion, city }) => ({ countryCode, stateRegion: stateRegion || undefined, city: city || undefined }));
  const update = (key: number, patch: Partial<LocationDraft>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-4" noValidate>
      <FormErrorAlert state={state} />
      <input type="hidden" name="locations:json" value={JSON.stringify(payload)} />
      <p className="text-sm text-muted-foreground">{t("locations.hint")}</p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("locations.empty")}</p> : null}
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-lg border p-3">
            <fieldset className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
              <legend className="sr-only">{t("locations.item", { n: index + 1 })}</legend>
              <FormField label={t("field.country")}>
                {(field) => <CountrySelect {...field} options={countries} value={row.countryCode} onValueChange={(v) => update(row.key, { countryCode: v })} placeholder={t("form.selectCountry")} />}
              </FormField>
              <FormField label={t("field.state")}>
                <Input value={row.stateRegion} onChange={(e) => update(row.key, { stateRegion: e.target.value })} maxLength={120} />
              </FormField>
              <FormField label={t("field.city")}>
                <Input value={row.city} onChange={(e) => update(row.key, { city: e.target.value })} maxLength={120} />
              </FormField>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))} aria-label={`${t("action.remove")}: ${t("locations.item", { n: index + 1 })}`}>
                <Trash2 aria-hidden="true" />
              </Button>
            </fieldset>
          </li>
        ))}
      </ol>
      {rows.length < 10 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRows((all) => [...all, { key: nextKey, countryCode: "", stateRegion: "", city: "" }]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus aria-hidden="true" />
          {t("locations.add")}
        </Button>
      ) : null}
      <FormFooterBar close={close} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Contact method, photo, resume
// ---------------------------------------------------------------------------

export function ContactMethodForm({ action, value }: { action: FormAction; value: string | null }) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-4" noValidate>
      <FormErrorAlert state={state} />
      <FormField label={t("field.contactMethod")} name="method" state={state} hint={t("field.contactMethod.hint")}>
        {(field) => (
          <SimpleSelect
            {...field}
            defaultValue={value ?? undefined}
            placeholder={t("form.select")}
            allowClear
            clearLabel={t("form.notSet")}
            options={["email", "phone", "whatsapp", "sms"].map((m) => ({ value: m, label: t(`contactMethod.${m}`) }))}
          />
        )}
      </FormField>
      <FormFooterBar close={close} />
    </form>
  );
}

export function FileRefForm({
  action,
  purpose,
  file,
  label,
  description,
}: {
  action: FormAction;
  purpose: "avatar" | "resume";
  file: FileSummary | null;
  label: string;
  description: string;
}) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-4" noValidate>
      <FormErrorAlert state={state} />
      <FileUpload purpose={purpose} name="fileId" label={label} description={description} defaultFiles={file ? [file] : []} invalid={Boolean(state && !state.ok && state.fieldErrors?.fileId)} />
      <p className="text-sm text-muted-foreground">{t("files.removeHint")}</p>
      <FormFooterBar close={close} />
    </form>
  );
}
