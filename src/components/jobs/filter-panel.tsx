"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useUrlFilters } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { track } from "@/modules/analytics/client";
import type { JobSearchFacets } from "@/modules/jobs/types";

import {
  activeFilterCount,
  activeFilterNames,
  ALL_FILTER_PARAMS,
  CLOSING_WITHIN_OPTIONS,
  isFlagOn,
  POSTED_WITHIN_OPTIONS,
  readMulti,
  toggleMultiPatch,
  type FlagFilterParam,
  type MultiFilterParam,
} from "./filter-params";
import { enumLabel } from "./labels";

export type FilterOption = { value: string; label: string };

export type JobFilterOptions = {
  categories: FilterOption[];
  industries: FilterOption[];
  countries: FilterOption[];
  currencies: FilterOption[];
  educationLevels: FilterOption[];
  overseasEnabled: boolean;
};

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "temporary", "internship", "apprenticeship", "freelance", "gig", "project_based"] as const;
const WORK_MODES = ["on_site", "remote", "hybrid"] as const;
const EXPERIENCE_LEVELS = ["fresher", "entry", "mid", "senior", "lead", "executive"] as const;
const SALARY_PERIODS = ["hour", "day", "week", "month", "year", "project"] as const;
const EXPERIENCE_YEARS = [0, 1, 2, 3, 5, 7, 10, 15, 20] as const;
const SHOW_FIRST = 8;

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type FacetMap = Map<string, number>;

function facetMap(buckets: { value: string; count: number }[] | undefined): FacetMap | null {
  return buckets ? new Map(buckets.map((b) => [b.value, b.count])) : null;
}

function FilterGroup({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <fieldset className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0" aria-labelledby={id}>
      <legend id={id} className="font-heading text-sm font-semibold text-navy">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** Checkbox list of one multi-value filter with facet counts; long lists collapse behind "Show more". */
function CheckboxList({ param, options, counts, label }: { param: MultiFilterParam; options: FilterOption[]; counts: FacetMap | null; label: string }) {
  const t = useT("talent-jobs");
  const filters = useUrlFilters();
  const selected = readMulti(filters, param);
  const [expanded, setExpanded] = useState(false);
  const baseId = useId();

  // Options with results (or selected) first, then the rest alphabetically as given.
  const ranked = counts
    ? [...options].sort((a, b) => {
        const sa = selected.includes(a.value) ? 1 : 0;
        const sb = selected.includes(b.value) ? 1 : 0;
        if (sa !== sb) return sb - sa;
        return (counts.get(b.value) ?? 0) - (counts.get(a.value) ?? 0);
      })
    : options;
  const visible = expanded ? ranked : ranked.slice(0, SHOW_FIRST);
  if (!options.length) return <p className="text-sm text-muted-foreground">{t("filters.noOptions")}</p>;

  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5" aria-label={label}>
        {visible.map((option) => {
          const id = `${baseId}-${option.value}`;
          const count = counts?.get(option.value) ?? (counts ? 0 : null);
          const checked = selected.includes(option.value);
          return (
            <li key={option.value} className="flex items-center gap-2">
              <Checkbox id={id} checked={checked} onCheckedChange={(on) => filters.setParams(toggleMultiPatch(filters, param, option.value, on === true))} />
              <Label htmlFor={id} className={cn("flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-sm font-normal", count === 0 && !checked && "text-muted-foreground")}>
                <span className="truncate">{option.label}</span>
                {count !== null ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    <span className="sr-only">{t("filters.countPrefix")} </span>
                    {count}
                  </span>
                ) : null}
              </Label>
            </li>
          );
        })}
      </ul>
      {ranked.length > SHOW_FIRST ? (
        <Button type="button" variant="link" size="sm" className="h-auto px-0 text-teal-strong" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? t("filters.showFewer") : t("filters.showAll", { count: ranked.length })}
        </Button>
      ) : null}
    </div>
  );
}

function FlagSwitch({ param, label, count }: { param: FlagFilterParam; label: string; count: number | null }) {
  const t = useT("talent-jobs");
  const filters = useUrlFilters();
  const id = useId();
  const on = isFlagOn(filters.get(param));
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
        {count !== null ? (
          <span className="ms-1 text-xs tabular-nums text-muted-foreground">
            <span className="sr-only">{t("filters.countPrefix")} </span>({count})
          </span>
        ) : null}
      </Label>
      <Switch id={id} checked={on} onCheckedChange={(v) => filters.setParams({ [param]: v ? "1" : null })} />
    </div>
  );
}

function SingleSelect({ param, label, options, allLabel }: { param: string; label: string; options: FilterOption[]; allLabel: string }) {
  const filters = useUrlFilters();
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">
        {label}
      </Label>
      <select id={id} className={SELECT_CLASS} value={filters.get(param) ?? ""} onChange={(e) => filters.setParams({ [param]: e.target.value || null })}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RadioDays({ param, options, label, anyLabel, labelFor }: { param: string; options: readonly number[]; label: string; anyLabel: string; labelFor: (days: number) => string }) {
  const filters = useUrlFilters();
  const name = useId();
  const current = filters.get(param) ?? "";
  const choices = [{ value: "", label: anyLabel }, ...options.map((d) => ({ value: String(d), label: labelFor(d) }))];
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {choices.map((choice) => {
        const id = `${name}-${choice.value || "any"}`;
        const checked = current === choice.value;
        return (
          <span key={choice.value || "any"}>
            <input
              type="radio"
              id={id}
              name={name}
              value={choice.value}
              checked={checked}
              onChange={() => filters.setParams({ [param]: choice.value || null })}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              className="inline-flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-xs font-medium text-foreground transition-colors peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
            >
              {choice.label}
            </label>
          </span>
        );
      })}
    </div>
  );
}

/** Salary range in one chosen currency and pay period (the module only compares like with like). */
function SalaryFilter({ currencies }: { currencies: FilterOption[] }) {
  const t = useT("talent-jobs");
  const filters = useUrlFilters();
  const baseId = useId();
  const urlState = {
    currency: filters.get("salaryCurrency") ?? "",
    period: filters.get("salaryPeriod") ?? "",
    min: filters.get("salaryMin") ?? "",
    max: filters.get("salaryMax") ?? "",
  };
  const urlKey = JSON.stringify(urlState);
  const [draft, setDraft] = useState(urlState);
  const [syncedKey, setSyncedKey] = useState(urlKey);
  const [error, setError] = useState<string | null>(null);
  if (urlKey !== syncedKey) {
    setSyncedKey(urlKey);
    setDraft(urlState);
  }

  function apply() {
    const min = draft.min.trim();
    const max = draft.max.trim();
    if ((min || max) && (!draft.currency || !draft.period)) {
      setError(t("filters.salaryNeedsCurrency"));
      return;
    }
    if (min && max && Number(max) < Number(min)) {
      setError(t("filters.salaryMaxBelowMin"));
      return;
    }
    setError(null);
    filters.setParams({
      salaryCurrency: draft.currency || null,
      salaryPeriod: draft.period || null,
      salaryMin: min || null,
      salaryMax: max || null,
    });
  }

  const errorId = `${baseId}-error`;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${baseId}-currency`} className="text-xs font-normal text-muted-foreground">
            {t("filters.currency")}
          </Label>
          <select id={`${baseId}-currency`} className={SELECT_CLASS} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
            <option value="">{t("filters.chooseCurrency")}</option>
            {currencies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${baseId}-period`} className="text-xs font-normal text-muted-foreground">
            {t("filters.period")}
          </Label>
          <select id={`${baseId}-period`} className={SELECT_CLASS} value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })}>
            <option value="">{t("filters.choosePeriod")}</option>
            {SALARY_PERIODS.map((p) => (
              <option key={p} value={p}>
                {enumLabel(t, "salaryPeriod", p)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${baseId}-min`} className="text-xs font-normal text-muted-foreground">
            {t("filters.salaryMin")}
          </Label>
          <Input
            id={`${baseId}-min`}
            inputMode="decimal"
            type="number"
            min={0}
            value={draft.min}
            onChange={(e) => setDraft({ ...draft, min: e.target.value })}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${baseId}-max`} className="text-xs font-normal text-muted-foreground">
            {t("filters.salaryMax")}
          </Label>
          <Input
            id={`${baseId}-max`}
            inputMode="decimal"
            type="number"
            min={0}
            value={draft.max}
            onChange={(e) => setDraft({ ...draft, max: e.target.value })}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
      </div>
      <p id={errorId} role="status" aria-live="polite" className={cn("text-xs text-danger-strong", !error && "sr-only")}>
        {error ?? ""}
      </p>
      <p className="text-xs text-muted-foreground">{t("filters.salaryHint")}</p>
      <Button type="button" variant="outline" size="sm" onClick={apply}>
        {t("filters.applySalary")}
      </Button>
    </div>
  );
}

/** Reports searches and filter changes (names and counts only — never the search words). */
function useSearchAnalytics(total: number) {
  const filters = useUrlFilters();
  const q = filters.get("q") ?? "";
  const names = activeFilterNames(filters).join(",");
  const location = filters.get("location") ?? "";
  const last = useRef<{ q: string; names: string; location: string } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = { q, names, location };
    if (!prev) {
      if (q || names || location) track("job_search", { hasKeywords: !!q, hasLocation: !!location, filterCount: names ? names.split(",").length : 0, results: total });
      return;
    }
    if (prev.q !== q || prev.location !== location) track("job_search", { hasKeywords: !!q, hasLocation: !!location, filterCount: names ? names.split(",").length : 0, results: total });
    if (prev.names !== names && names) track("filter_applied", { filters: names, results: total });
  }, [q, names, location, total]);
}

type FilterPanelProps = { options: JobFilterOptions; facets: JobSearchFacets | null; total: number };

/** Every filter group of spec 8.4, reading and writing the URL. Used inline (desktop) and in the sheet (phones). */
function FilterControls({ options, facets }: Omit<FilterPanelProps, "total">) {
  const t = useT("talent-jobs");
  const ids = { category: useId(), place: useId(), type: useId(), mode: useId(), exp: useId(), salary: useId(), more: useId(), dates: useId(), industry: useId() };
  const typeOptions = EMPLOYMENT_TYPES.map((v) => ({ value: v, label: enumLabel(t, "employmentType", v) }));
  const modeOptions = WORK_MODES.map((v) => ({ value: v, label: enumLabel(t, "workMode", v) }));
  const levelOptions = EXPERIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel(t, "experienceLevel", v) }));
  const yearOptions = EXPERIENCE_YEARS.map((y) => ({ value: String(y), label: y === 0 ? t("filters.yearsNone") : t("filters.years", { count: y }) }));

  return (
    <div className="space-y-4">
      <FilterGroup title={t("filters.trust")} id={ids.more}>
        <FlagSwitch param="verifiedOnly" label={t("filters.verifiedOnly")} count={facets ? facets.verified : null} />
        {options.overseasEnabled ? <FlagSwitch param="overseas" label={t("filters.overseas")} count={facets ? facets.overseas : null} /> : null}
      </FilterGroup>
      <FilterGroup title={t("filters.category")} id={ids.category}>
        <CheckboxList param="category" options={options.categories} counts={facetMap(facets?.categories)} label={t("filters.category")} />
      </FilterGroup>
      <FilterGroup title={t("filters.country")} id={ids.place}>
        <CheckboxList param="country" options={options.countries} counts={facetMap(facets?.countries)} label={t("filters.country")} />
      </FilterGroup>
      <FilterGroup title={t("filters.employmentType")} id={ids.type}>
        <CheckboxList param="type" options={typeOptions} counts={facetMap(facets?.employmentTypes)} label={t("filters.employmentType")} />
      </FilterGroup>
      <FilterGroup title={t("filters.workMode")} id={ids.mode}>
        <CheckboxList param="mode" options={modeOptions} counts={facetMap(facets?.workModes)} label={t("filters.workMode")} />
      </FilterGroup>
      <FilterGroup title={t("filters.experience")} id={ids.exp}>
        <SingleSelect param="experienceYears" label={t("filters.yourExperience")} options={yearOptions} allLabel={t("filters.anyExperience")} />
        <CheckboxList param="experienceLevels" options={levelOptions} counts={null} label={t("filters.experienceLevel")} />
      </FilterGroup>
      <FilterGroup title={t("filters.salary")} id={ids.salary}>
        <SalaryFilter currencies={options.currencies} />
      </FilterGroup>
      <FilterGroup title={t("filters.industryAndQualification")} id={ids.industry}>
        <SingleSelect param="industry" label={t("filters.industry")} options={options.industries} allLabel={t("filters.anyIndustry")} />
        <SingleSelect param="educationLevelId" label={t("filters.qualification")} options={options.educationLevels} allLabel={t("filters.anyQualification")} />
      </FilterGroup>
      <FilterGroup title={t("filters.dates")} id={ids.dates}>
        <p className="text-xs text-muted-foreground">{t("filters.postedWithin")}</p>
        <RadioDays
          param="postedWithinDays"
          options={POSTED_WITHIN_OPTIONS}
          label={t("filters.postedWithin")}
          anyLabel={t("filters.anyTime")}
          labelFor={(d) => (d === 1 ? t("filters.last24h") : t("filters.lastDays", { count: d }))}
        />
        <p className="pt-1 text-xs text-muted-foreground">{t("filters.closingWithin")}</p>
        <RadioDays param="closingWithinDays" options={CLOSING_WITHIN_OPTIONS} label={t("filters.closingWithin")} anyLabel={t("filters.anyTime")} labelFor={(d) => t("filters.nextDays", { count: d })} />
      </FilterGroup>
    </div>
  );
}

/**
 * Job search filter panel: a sticky sidebar from `lg`, a "Filters (n)" sheet on smaller screens. Changes
 * apply immediately (URL-synced, page reset); the sheet's button shows the live result count.
 */
export function JobFilterPanel({ options, facets, total }: FilterPanelProps) {
  const t = useT("talent-jobs");
  const filters = useUrlFilters();
  const count = activeFilterCount(filters);
  const [open, setOpen] = useState(false);
  useSearchAnalytics(total);

  const clear = count ? (
    <Button type="button" variant="ghost" size="sm" onClick={() => filters.reset(ALL_FILTER_PARAMS.filter((p) => p !== "q"))}>
      <X aria-hidden="true" />
      {t("filters.clearAll")}
    </Button>
  ) : null;

  return (
    <>
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className="w-full sm:w-auto" data-testid="open-filters">
              <SlidersHorizontal aria-hidden="true" />
              {count ? t("filters.buttonCount", { count }) : t("filters.button")}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-full max-w-sm flex-col gap-0 p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>{t("filters.title")}</SheetTitle>
              <SheetDescription>{t("filters.sheetDescription")}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <FilterControls options={options} facets={facets} />
            </div>
            <SheetFooter className="flex-row items-center justify-between gap-2 border-t px-4 py-3">
              {clear ?? <span />}
              <Button type="button" onClick={() => setOpen(false)} aria-busy={filters.isPending || undefined}>
                {t("filters.showResults", { count: total })}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
      <aside className="hidden lg:block" aria-label={t("filters.title")}>
        <div className="sticky top-20 space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-base font-semibold text-navy">{t("filters.title")}</h2>
            {clear}
          </div>
          <FilterControls options={options} facets={facets} />
        </div>
      </aside>
    </>
  );
}
