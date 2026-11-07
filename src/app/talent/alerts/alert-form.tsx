"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enumLabel } from "@/components/jobs/labels";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/actions";

import { saveAlertAction } from "./actions";

export type AlertDraft = {
  id?: string;
  name: string;
  keywords: string;
  categoryIds: string[];
  countries: string[];
  employmentTypes: string[];
  workModes: string[];
  overseasOnly: boolean;
  salaryMin: string;
  salaryCurrency: string;
  salaryPeriod: string;
  frequency: "daily" | "weekly";
  channels: string[];
  isActive: boolean;
};

type Option = { value: string; label: string };

type AlertFormProps = {
  draft: AlertDraft;
  categories: Option[];
  countries: Option[];
  currencies: Option[];
  /** Minors never receive overseas jobs (CONVENTIONS 15.6): the overseas option is hidden. */
  allowOverseas: boolean;
  hasPhone: boolean;
};

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "temporary", "internship", "apprenticeship", "freelance", "gig", "project_based"] as const;
const WORK_MODES = ["on_site", "remote", "hybrid"] as const;
const SALARY_PERIODS = ["hour", "day", "week", "month", "year", "project"] as const;
const CHANNELS = ["email", "in_app", "whatsapp", "sms"] as const;
const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

function CheckboxGroup({ name, legend, options, defaults, hint }: { name: string; legend: string; options: Option[]; defaults: string[]; hint?: string }) {
  const baseId = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const id = `${baseId}-${o.value}`;
          return (
            <div key={o.value} className="flex items-center gap-2">
              <Checkbox id={id} name={`${name}[]`} value={o.value} defaultChecked={defaults.includes(o.value)} />
              <Label htmlFor={id} className="text-sm font-normal">
                {o.label}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Create or edit a job alert: what to match, how often, and through which channels. */
export function AlertForm({ draft, categories, countries, currencies, allowOverseas, hasPhone }: AlertFormProps) {
  const t = useT("talent-jobs");
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState<{ id: string; created: boolean }>, FormData>(saveAlertAction, null);
  const ids = { overseas: useId(), freq: useId() };
  useActionToast(state, {
    successMessage: draft.id ? t("alerts.updated") : t("alerts.created"),
    onSuccess: () => router.replace("/talent/alerts", { scroll: false }),
  });

  const pick = (all: Option[], values: string[]) => all.filter((o) => values.includes(o.value));
  const channelOptions = CHANNELS.map((c) => ({ value: c, label: enumLabel(t, "alertChannel", c) }));

  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate data-testid="alert-form">
      {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
      <input type="hidden" name="isActive" value={draft.isActive ? "true" : "false"} />
      <FormErrorAlert state={state} title={t("form.fixErrors")} />

      <FormField label={t("alerts.name")} name="name" required state={state} hint={t("alerts.nameHint")}>
        <Input defaultValue={draft.name} maxLength={80} autoComplete="off" />
      </FormField>
      <FormField label={t("alerts.keywords")} name="keywords" optional state={state} hint={t("alerts.keywordsHint")}>
        <Input defaultValue={draft.keywords} maxLength={200} />
      </FormField>

      <div className="grid gap-5 md:grid-cols-2">
        <FormField label={t("filters.category")} name="categoryIds" optional state={state}>
          {(field) => (
            <MultiCombobox
              {...field}
              name="categoryIds"
              options={categories}
              defaultValue={pick(categories, draft.categoryIds)}
              maxSelected={10}
              placeholder={t("alerts.anyCategory")}
              searchPlaceholder={t("alerts.searchCategories")}
              emptyText={t("filters.noOptions")}
            />
          )}
        </FormField>
        <FormField label={t("filters.country")} name="countries" optional state={state}>
          {(field) => (
            <MultiCombobox
              {...field}
              name="countries"
              options={countries}
              defaultValue={pick(countries, draft.countries)}
              maxSelected={20}
              placeholder={t("alerts.anyCountry")}
              searchPlaceholder={t("alerts.searchCountries")}
              emptyText={t("filters.noOptions")}
            />
          )}
        </FormField>
      </div>

      <CheckboxGroup name="employmentTypes" legend={t("filters.employmentType")} options={EMPLOYMENT_TYPES.map((v) => ({ value: v, label: enumLabel(t, "employmentType", v) }))} defaults={draft.employmentTypes} />
      <CheckboxGroup name="workModes" legend={t("filters.workMode")} options={WORK_MODES.map((v) => ({ value: v, label: enumLabel(t, "workMode", v) }))} defaults={draft.workModes} />

      {allowOverseas ? (
        <div className="flex items-center gap-2">
          <Checkbox id={ids.overseas} name="overseasOnly" defaultChecked={draft.overseasOnly} />
          <Label htmlFor={ids.overseas} className="text-sm font-normal">
            {t("alerts.overseasOnly")}
          </Label>
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">{t("alerts.minimumSalary")}</legend>
        <p className="text-xs text-muted-foreground">{t("alerts.salaryHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("filters.salaryMin")} name="salaryMin" state={state}>
            <Input type="number" inputMode="decimal" min={0} defaultValue={draft.salaryMin} />
          </FormField>
          <FormField label={t("filters.currency")} name="salaryCurrency" state={state}>
            <select className={SELECT_CLASS} defaultValue={draft.salaryCurrency}>
              <option value="">{t("filters.chooseCurrency")}</option>
              {currencies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("filters.period")} name="salaryPeriod" state={state}>
            <select className={SELECT_CLASS} defaultValue={draft.salaryPeriod}>
              <option value="">{t("filters.choosePeriod")}</option>
              {SALARY_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {enumLabel(t, "salaryPeriod", p)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend id={ids.freq} className="text-sm font-medium text-foreground">
          {t("alerts.frequency")}
        </legend>
        <div className="flex flex-wrap gap-4" role="radiogroup" aria-labelledby={ids.freq}>
          {(["daily", "weekly"] as const).map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="radio" name="frequency" value={f} defaultChecked={draft.frequency === f} className="size-4 accent-[var(--color-navy)]" />
              {enumLabel(t, "alertFrequency", f)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1">
        <CheckboxGroup name="channels" legend={t("alerts.channels")} options={channelOptions} defaults={draft.channels} hint={hasPhone ? t("alerts.channelsHint") : t("alerts.channelsNoPhone")} />
        {state && !state.ok && state.fieldErrors?.channels ? (
          <p className="text-sm text-danger-strong" role="alert">
            {state.fieldErrors.channels[0]}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <SubmitButton pendingLabel={t("common.saving")}>{draft.id ? t("alerts.saveChanges") : t("alerts.createButton")}</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => router.replace("/talent/alerts", { scroll: false })}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
