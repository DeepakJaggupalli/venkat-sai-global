"use client";

import { FileUpload } from "@/components/files";
import { useEmployerForm } from "@/components/employer/use-form-action";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { CountrySelect, CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import type { FileSummary } from "@/modules/files/types";

import { updateCompanyProfileAction } from "../actions";

export type CompanyProfileDefaults = {
  companySize: string | null;
  foundedYear: number | null;
  headquartersCountryCode: string | null;
  hiringRegions: string[];
  typicalRoles: string[];
  typicalJobCategoryIds: string[];
  employerBrandingTagline: string | null;
  aboutHtml: string | null;
  socialLinks: Partial<Record<"linkedin" | "facebook" | "instagram" | "x" | "youtube" | "whatsapp", string>>;
  benefitsOffered: string[];
  publicContactEmail: string | null;
  publicContactPhone: string | null;
  isHiringOverseas: boolean;
  defaultCurrency: string | null;
};

const SOCIAL_FIELDS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X (Twitter)" },
  { key: "youtube", label: "YouTube" },
  { key: "whatsapp", label: "WhatsApp link" },
] as const;

const FIELD_LABELS: Record<string, string> = {
  companySize: "Company size",
  foundedYear: "Year founded",
  headquartersCountryCode: "Headquarters country",
  hiringRegions: "Countries you hire for",
  typicalRoles: "Roles you usually hire",
  typicalJobCategoryIds: "Job categories",
  employerBrandingTagline: "Tagline",
  aboutHtml: "About the company",
  coverFileId: "Cover image",
  benefitsOffered: "Benefits",
  cultureMediaFileIds: "Workplace photos",
  publicContactEmail: "Recruitment email",
  publicContactPhone: "Recruitment phone",
  defaultCurrency: "Default currency",
  ...Object.fromEntries(SOCIAL_FIELDS.map((s) => [s.key, s.label])),
};

const pick = (options: SelectOption[], values: string[]) => values.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v });

export function CompanyProfileForm({
  organizationId,
  defaults,
  cover,
  cultureMedia,
  countries,
  currencies,
  categories,
  sizeOptions,
}: {
  organizationId: string;
  defaults: CompanyProfileDefaults;
  cover: FileSummary | null;
  cultureMedia: FileSummary[];
  countries: SelectOption[];
  currencies: SelectOption[];
  categories: SelectOption[];
  sizeOptions: SelectOption[];
}) {
  const { state, pending, onSubmit } = useEmployerForm(updateCompanyProfileAction);
  useActionToast(state);
  const err = (name: string) => (state?.ok === false ? state.fieldErrors?.[name] : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Employer brand</legend>
        <FormField label="Tagline" name="employerBrandingTagline" optional state={state} hint="One line shown under your name, up to 160 characters.">
          <Input defaultValue={defaults.employerBrandingTagline ?? undefined} maxLength={160} />
        </FormField>
        <FormField label="About the company" name="aboutHtml" optional state={state} hint="What you build, where you work and what it is like to work with you.">
          {(field) => <RichTextEditor {...field} name="aboutHtml" defaultValue={defaults.aboutHtml ?? ""} maxLength={20000} toolbarLabel="About the company formatting" />}
        </FormField>
        <FileUpload
          purpose="org_logo"
          name="coverFileId"
          organizationId={organizationId}
          label="Cover image (optional)"
          description="A wide photo of your work, site or team. It is public, so only use images you may publish."
          defaultFiles={cover ? [cover] : []}
          invalid={Boolean(err("coverFileId"))}
        />
        <FileUpload
          purpose="org_logo"
          name="cultureMediaFileIds"
          organizationId={organizationId}
          multiple
          maxFiles={12}
          label="Workplace photos (optional)"
          description="Up to 12 photos. Make sure everyone pictured agreed to appear publicly."
          defaultFiles={cultureMedia}
          invalid={Boolean(err("cultureMediaFileIds"))}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Company facts</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Company size" name="companySize" optional state={state}>
            <SimpleSelect options={sizeOptions} defaultValue={defaults.companySize ?? undefined} placeholder="Choose a size" allowClear clearLabel="Not stated" />
          </FormField>
          <FormField label="Year founded" name="foundedYear" optional state={state}>
            <Input type="number" inputMode="numeric" min={1800} max={2100} defaultValue={defaults.foundedYear ?? undefined} />
          </FormField>
          <FormField label="Headquarters country" name="headquartersCountryCode" optional state={state}>
            {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.headquartersCountryCode ?? undefined} placeholder="Choose a country" allowClear />}
          </FormField>
          <FormField label="Default currency" name="defaultCurrency" optional state={state} hint="Suggested for salaries and requirements. You can choose another on each job.">
            {(field) => <CurrencySelect {...field} options={currencies} defaultValue={defaults.defaultCurrency ?? undefined} placeholder="Choose a currency" allowClear />}
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Hiring</legend>
        <FormField label="Countries you hire for" name="hiringRegions" optional state={state}>
          {(field) => <MultiCombobox {...field} name="hiringRegions" options={countries} defaultValue={pick(countries, defaults.hiringRegions)} placeholder="Add countries" searchPlaceholder="Search countries" />}
        </FormField>
        <FormField label="Job categories" name="typicalJobCategoryIds" optional state={state}>
          {(field) => <MultiCombobox {...field} name="typicalJobCategoryIds" options={categories} defaultValue={pick(categories, defaults.typicalJobCategoryIds)} placeholder="Add categories" searchPlaceholder="Search categories" />}
        </FormField>
        <FormField label="Roles you usually hire" name="typicalRoles" optional state={state} hint="For example Pipe welder, Rigger, Electrician. Press Enter after each role.">
          {(field) => <TagInput {...field} name="typicalRoles" defaultValue={defaults.typicalRoles} maxTags={30} maxLength={100} placeholder="Add a role" />}
        </FormField>
        <FormField label="Benefits" name="benefitsOffered" optional state={state} hint="Only list benefits you provide. Press Enter after each one.">
          {(field) => <TagInput {...field} name="benefitsOffered" defaultValue={defaults.benefitsOffered} maxTags={30} maxLength={120} placeholder="Add a benefit" />}
        </FormField>
        <div className="flex items-start gap-3">
          <input
            id="isHiringOverseas"
            type="checkbox"
            name="isHiringOverseas"
            value="true"
            defaultChecked={defaults.isHiringOverseas}
            className="mt-1 size-4 shrink-0 rounded border-input accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <label htmlFor="isHiringOverseas" className="text-sm leading-6 text-foreground">
            We hire for overseas employment (positions outside the worker&apos;s home country)
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Public recruitment contact</legend>
        <p className="text-sm text-muted-foreground">Shown on your public page. Use a shared recruitment inbox, not a personal address.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Recruitment email" name="publicContactEmail" optional state={state}>
            <Input type="email" defaultValue={defaults.publicContactEmail ?? undefined} maxLength={254} />
          </FormField>
          <FormField label="Recruitment phone" name="publicContactPhone" optional state={state}>
            <Input type="tel" defaultValue={defaults.publicContactPhone ?? undefined} maxLength={24} />
          </FormField>
          {SOCIAL_FIELDS.map((s) => (
            <FormField key={s.key} label={s.label} name={s.key} optional state={state}>
              <Input type="url" inputMode="url" placeholder="https://" defaultValue={defaults.socialLinks[s.key] ?? undefined} maxLength={500} />
            </FormField>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end border-t border-border pt-4">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save company profile
        </SubmitButton>
      </div>
    </form>
  );
}
