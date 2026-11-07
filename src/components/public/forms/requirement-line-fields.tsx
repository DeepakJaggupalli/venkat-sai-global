"use client";

import { Trash2 } from "lucide-react";

import { FormField } from "@/components/shared/form";
import { CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { RequirementLineDraft } from "./requirement-lines";

export const SALARY_PERIOD_OPTIONS: SelectOption[] = [
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
  { value: "year", label: "Per year" },
  { value: "project", label: "Per project" },
];

/**
 * One role line of the workforce requirement form. Controlled by the parent (values live in a JSON payload,
 * not in named inputs); server errors arrive as `lines.<index>.<field>` and are mapped to this row.
 */
export function RequirementLineFields({
  line,
  index,
  total,
  errors,
  currencies,
  onChange,
  onRemove,
}: {
  line: RequirementLineDraft;
  index: number;
  total: number;
  errors: Record<string, string[]>;
  currencies: SelectOption[];
  onChange: (patch: Partial<RequirementLineDraft>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const f = (name: keyof RequirementLineDraft) => `line-${line.key}-${name}`;
  const text = (name: keyof RequirementLineDraft) => ({
    value: line[name],
    onChange: (e: { target: { value: string } }) => onChange({ [name]: e.target.value }),
  });
  return (
    <fieldset className="rounded-xl border border-border bg-surface-subtle p-5 sm:p-6" data-testid="requirement-line">
      <div className="flex items-center justify-between gap-3">
        <legend className="font-heading text-base font-semibold text-navy">Role {n}</legend>
        {total > 1 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-danger-strong hover:text-danger-strong">
            <Trash2 aria-hidden="true" />
            Remove<span className="sr-only"> role {n}</span>
          </Button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-6">
        <FormField label="Role or trade" name={f("roleTitle")} id={f("roleTitle")} required errors={errors.roleTitle} className="sm:col-span-4" hint="For example: TIG welder, pipe fitter, electrician">
          <Input maxLength={160} {...text("roleTitle")} />
        </FormField>
        <FormField label="Number of positions" name={f("positions")} id={f("positions")} required errors={errors.positions} className="sm:col-span-2">
          <Input type="number" inputMode="numeric" min={1} max={100000} {...text("positions")} />
        </FormField>
        <FormField label="Minimum experience (years)" name={f("experienceMinYears")} id={f("experienceMinYears")} optional errors={errors.experienceMinYears} className="sm:col-span-3">
          <Input type="number" inputMode="numeric" min={0} max={60} {...text("experienceMinYears")} />
        </FormField>
        <FormField label="Maximum experience (years)" name={f("experienceMaxYears")} id={f("experienceMaxYears")} optional errors={errors.experienceMaxYears} className="sm:col-span-3">
          <Input type="number" inputMode="numeric" min={0} max={60} {...text("experienceMaxYears")} />
        </FormField>
        <FormField label="Qualification" name={f("qualification")} id={f("qualification")} optional errors={errors.qualification} className="sm:col-span-6">
          <Input maxLength={300} placeholder="For example: ITI Welder, 6G certification" {...text("qualification")} />
        </FormField>
        <FormField label="Required skills" name={f("requiredSkills")} id={f("requiredSkills")} optional errors={errors.requiredSkills} className="sm:col-span-6" hint="Separate skills with commas.">
          <Input maxLength={1200} {...text("requiredSkills")} />
        </FormField>
        <FormField label="Salary from" name={f("salaryMin")} id={f("salaryMin")} optional errors={errors.salaryMin} className="sm:col-span-3 lg:col-span-1">
          <Input type="number" inputMode="decimal" min={0} step="any" {...text("salaryMin")} />
        </FormField>
        <FormField label="Salary to" name={f("salaryMax")} id={f("salaryMax")} optional errors={errors.salaryMax} className="sm:col-span-3 lg:col-span-1">
          <Input type="number" inputMode="decimal" min={0} step="any" {...text("salaryMax")} />
        </FormField>
        <FormField label="Currency" name={f("salaryCurrency")} id={f("salaryCurrency")} optional errors={errors.salaryCurrency} className="sm:col-span-3 lg:col-span-2" hint="Required when you give a salary.">
          {(field) => <CurrencySelect {...field} name={undefined} options={currencies} value={line.salaryCurrency} onValueChange={(v) => onChange({ salaryCurrency: v })} allowClear placeholder="Choose currency" />}
        </FormField>
        <FormField label="Salary period" name={f("salaryPeriod")} id={f("salaryPeriod")} optional errors={errors.salaryPeriod} className="sm:col-span-3 lg:col-span-2">
          {(field) => <SimpleSelect {...field} name={undefined} options={SALARY_PERIOD_OPTIONS} value={line.salaryPeriod} onValueChange={(v) => onChange({ salaryPeriod: v })} allowClear placeholder="Choose period" />}
        </FormField>
        <FormField label="Notes for this role" name={f("notes")} id={f("notes")} optional errors={errors.notes} className="sm:col-span-6">
          <Textarea rows={2} maxLength={2000} {...text("notes")} />
        </FormField>
      </div>
    </fieldset>
  );
}
