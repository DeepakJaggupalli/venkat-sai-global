"use client";

import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { CountrySelect, CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { SkillPicker } from "@/components/shared/skill-picker";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { track } from "@/modules/analytics/client";
import { cn } from "@/lib/utils";

import { buildCandidateSearchQuery } from "./search-query";

export type CandidateFilterOptions = {
  countries: SelectOption[];
  currencies: SelectOption[];
  languages: SelectOption[];
  educationLevels: SelectOption[];
  availability: SelectOption[];
  employmentTypes: SelectOption[];
  workModes: SelectOption[];
  salaryPeriods: SelectOption[];
  verificationLevels: SelectOption[];
  proficiencies: SelectOption[];
};

export type CandidateFilterValues = {
  q?: string;
  skills: SelectOption[];
  skillMatch: "all" | "any";
  verifiedSkillsOnly: boolean;
  experienceMinYears?: number;
  experienceMaxYears?: number;
  countryCode?: string;
  stateRegion?: string;
  city?: string;
  preferredCountryCode?: string;
  availability: string[];
  languageCodes: string[];
  minLanguageProficiency?: string;
  educationLevelId?: string;
  verifiedCredentialsOnly: boolean;
  assessedOnly: boolean;
  employmentTypes: string[];
  workModes: string[];
  openToOverseas: boolean;
  passportValid: boolean;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  minVerificationLevel?: string;
  activeWithinDays?: number;
  forOverseasRole: boolean;
  sort: string;
};

const ACTIVE_OPTIONS: SelectOption[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-1 font-heading text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ name, value = "true", label, defaultChecked, hint }: { name: string; value?: string; label: string; defaultChecked: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-4 shrink-0 rounded border-input accent-navy" />
      <Label htmlFor={id} className="text-sm leading-snug font-normal">
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </Label>
    </div>
  );
}

function Field({ label, children, htmlFor }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Advanced candidate search (spec 9.4). A GET-style form: submitting writes the filters to the URL, the
 * server page validates them with parseCandidateSearchParams before searching.
 */
export function CandidateFilters({ options, values, activeCount }: { options: CandidateFilterOptions; values: CandidateFilterValues; activeCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ids = { q: useId(), min: useId(), max: useId(), state: useId(), city: useId(), salary: useId() };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = buildCandidateSearchQuery(new FormData(event.currentTarget));
    track("filter_applied", { context: "candidate_search", filters: query ? query.split("&").length : 0 });
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    setOpen(false);
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 p-4 lg:hidden">
        <p className="font-heading text-sm font-semibold">Search filters{activeCount ? ` (${activeCount} active)` : ""}</p>
        <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls="candidate-filter-form" onClick={() => setOpen((v) => !v)}>
          <SlidersHorizontal aria-hidden className="size-4" />
          {open ? "Hide filters" : "Show filters"}
        </Button>
      </div>
      <form id="candidate-filter-form" role="search" aria-label="Candidate search filters" onSubmit={onSubmit} className={cn("space-y-4 p-4 lg:block", open ? "block border-t lg:border-t-0" : "hidden")}>
        <Field label="Trade, role or keyword" htmlFor={ids.q}>
          <Input id={ids.q} name="q" type="search" defaultValue={values.q} placeholder="e.g. TIG welder, pipe fitter" maxLength={200} />
        </Field>

        <Group title="Skills">
          <SkillPicker name="skillIds" defaultValue={values.skills} aria-label="Skills" maxSelected={20} />
          <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Skill match">
            {(["any", "all"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="radio" name="skillMatch" value={m} defaultChecked={values.skillMatch === m} className="size-4" />
                {m === "any" ? "Any of these skills" : "All of these skills"}
              </label>
            ))}
          </div>
          <Check name="verifiedSkillsOnly" label="Verified skills only" defaultChecked={values.verifiedSkillsOnly} />
        </Group>

        <Group title="Experience">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum years" htmlFor={ids.min}>
              <Input id={ids.min} name="experienceMinYears" type="number" inputMode="numeric" min={0} max={60} defaultValue={values.experienceMinYears} />
            </Field>
            <Field label="Maximum years" htmlFor={ids.max}>
              <Input id={ids.max} name="experienceMaxYears" type="number" inputMode="numeric" min={0} max={60} defaultValue={values.experienceMaxYears} />
            </Field>
          </div>
        </Group>

        <Group title="Qualifications and credentials">
          <Field label="Minimum education">
            <SimpleSelect name="educationLevelId" options={options.educationLevels} defaultValue={values.educationLevelId} placeholder="Any education" allowClear clearLabel="Any education" aria-label="Minimum education" />
          </Field>
          <Check name="verifiedCredentialsOnly" label="Has a certificate or licence verified by Venkat Sai" defaultChecked={values.verifiedCredentialsOnly} />
          <Check name="assessedOnly" label="Passed a Venkat Sai assessment" hint="Only candidates who agreed to share their results." defaultChecked={values.assessedOnly} />
          <Field label="Profile verification">
            <SimpleSelect name="minVerificationLevel" options={options.verificationLevels} defaultValue={values.minVerificationLevel} placeholder="Any level" allowClear clearLabel="Any level" aria-label="Minimum profile verification" />
          </Field>
        </Group>

        <Group title="Location">
          <Field label="Country">
            <CountrySelect name="countryCode" options={options.countries} defaultValue={values.countryCode} allowClear clearLabel="Any country" aria-label="Country" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State or region" htmlFor={ids.state}>
              <Input id={ids.state} name="stateRegion" defaultValue={values.stateRegion} maxLength={120} />
            </Field>
            <Field label="City" htmlFor={ids.city}>
              <Input id={ids.city} name="city" defaultValue={values.city} maxLength={120} />
            </Field>
          </div>
          <Field label="Willing to work in">
            <CountrySelect name="preferredCountryCode" options={options.countries} defaultValue={values.preferredCountryCode} allowClear clearLabel="Any country" aria-label="Willing to work in" />
          </Field>
        </Group>

        <Group title="Availability">
          {options.availability.map((o) => (
            <Check key={o.value} name="availability[]" value={o.value} label={o.label} defaultChecked={values.availability.includes(o.value)} />
          ))}
          <Field label="Active on the platform">
            <SimpleSelect name="activeWithinDays" options={ACTIVE_OPTIONS} defaultValue={values.activeWithinDays ? String(values.activeWithinDays) : undefined} placeholder="Any time" allowClear clearLabel="Any time" aria-label="Active on the platform" />
          </Field>
        </Group>

        <Group title="Languages">
          <MultiCombobox
            name="languageCodes"
            options={options.languages}
            defaultValue={options.languages.filter((l) => values.languageCodes.includes(l.value))}
            placeholder="Any language"
            searchPlaceholder="Search languages"
            emptyText="No language found."
            aria-label="Languages (all of them)"
            maxSelected={10}
          />
          <Field label="Minimum level">
            <SimpleSelect name="minLanguageProficiency" options={options.proficiencies} defaultValue={values.minLanguageProficiency} placeholder="Any level" allowClear clearLabel="Any level" aria-label="Minimum language level" />
          </Field>
        </Group>

        <Group title="Employment preference">
          {options.employmentTypes.map((o) => (
            <Check key={o.value} name="employmentTypes[]" value={o.value} label={o.label} defaultChecked={values.employmentTypes.includes(o.value)} />
          ))}
          <div className="border-t pt-3" />
          {options.workModes.map((o) => (
            <Check key={o.value} name="workModes[]" value={o.value} label={o.label} defaultChecked={values.workModes.includes(o.value)} />
          ))}
          <div className="border-t pt-3" />
          <Check name="openToOverseas" label="Open to working overseas" defaultChecked={values.openToOverseas} />
          <Check name="passportValid" label="Holds a valid passport" defaultChecked={values.passportValid} />
          <Check name="forOverseasRole" label="I am hiring for an overseas role" hint="Candidates under 18 are never shown for overseas roles." defaultChecked={values.forOverseasRole} />
        </Group>

        <Group title="Salary expectation">
          <p className="text-xs text-muted-foreground">Shows candidates expecting at most this amount in the same currency and pay period, plus those who have not set an expectation.</p>
          <Field label="Budget up to" htmlFor={ids.salary}>
            <Input id={ids.salary} name="salaryMax" type="number" inputMode="decimal" min={0} step="any" defaultValue={values.salaryMax} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <CurrencySelect name="salaryCurrency" options={options.currencies} defaultValue={values.salaryCurrency} allowClear clearLabel="None" aria-label="Salary currency" />
            </Field>
            <Field label="Pay period">
              <SimpleSelect name="salaryPeriod" options={options.salaryPeriods} defaultValue={values.salaryPeriod} placeholder="Choose" allowClear clearLabel="None" aria-label="Pay period" />
            </Field>
          </div>
        </Group>

        <input type="hidden" name="sort" value={values.sort} />
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="submit" disabled={pending} aria-disabled={pending}>
            {pending ? "Searching…" : "Search candidates"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}>
            Reset
          </Button>
        </div>
      </form>
    </div>
  );
}
