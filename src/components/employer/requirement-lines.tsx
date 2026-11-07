"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { CurrencySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { salaryPeriodOptions } from "./labels";
import { emptyLine, serializeLines, type RequirementLineDraft } from "./requirement-lines-data";

export { emptyLine, serializeLines, type RequirementLineDraft };

function LineEditor({
  line,
  index,
  canRemove,
  categories,
  currencies,
  errors,
  onChange,
  onRemove,
}: {
  line: RequirementLineDraft;
  index: number;
  canRemove: boolean;
  categories: SelectOption[];
  currencies: SelectOption[];
  errors: Record<string, string>;
  onChange: (l: RequirementLineDraft) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const set = (p: Partial<RequirementLineDraft>) => onChange({ ...line, ...p });
  const field = (name: keyof RequirementLineDraft, label: string, input: React.ReactNode, hint?: string) => {
    const err = errors[name];
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-${name}`}>{label}</Label>
        {input}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {err ? (
          <p id={`${uid}-${name}-error`} className="text-sm font-medium text-danger-strong">
            {err}
          </p>
        ) : null}
      </div>
    );
  };
  const aria = (name: string) => ({ id: `${uid}-${name}`, "aria-invalid": errors[name] ? (true as const) : undefined, "aria-describedby": errors[name] ? `${uid}-${name}-error` : undefined });

  return (
    <li className="space-y-4 rounded-lg border border-border bg-background p-4" data-testid="requirement-line">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Trade {index + 1}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={!canRemove} aria-label={`Remove trade ${index + 1}`}>
          <Trash2 aria-hidden="true" /> Remove
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">{field("roleTitle", "Role / trade", <Input {...aria("roleTitle")} value={line.roleTitle} onChange={(e) => set({ roleTitle: e.target.value })} maxLength={160} placeholder="Pipe fitter" />)}</div>
        {field("positions", "Positions", <Input {...aria("positions")} type="number" inputMode="numeric" min={1} value={line.positions} onChange={(e) => set({ positions: e.target.value })} />)}
        {field(
          "jobCategoryId",
          "Category",
          <SearchableSelect {...aria("jobCategoryId")} options={categories} value={line.jobCategoryId} onValueChange={(v) => set({ jobCategoryId: v })} placeholder="Optional" allowClear />,
        )}
        {field("experienceMinYears", "Min. experience (years)", <Input {...aria("experienceMinYears")} type="number" inputMode="numeric" min={0} max={60} value={line.experienceMinYears} onChange={(e) => set({ experienceMinYears: e.target.value })} />)}
        {field("experienceMaxYears", "Max. experience (years)", <Input {...aria("experienceMaxYears")} type="number" inputMode="numeric" min={0} max={60} value={line.experienceMaxYears} onChange={(e) => set({ experienceMaxYears: e.target.value })} />)}
        <div className="sm:col-span-2">{field("qualification", "Qualification / certification", <Input {...aria("qualification")} value={line.qualification} onChange={(e) => set({ qualification: e.target.value })} maxLength={300} placeholder="ITI Fitter, 6G certified" />)}</div>
        {field("salaryMin", "Salary from", <Input {...aria("salaryMin")} type="number" inputMode="decimal" min={0} step="0.01" value={line.salaryMin} onChange={(e) => set({ salaryMin: e.target.value })} />)}
        {field("salaryMax", "Salary to", <Input {...aria("salaryMax")} type="number" inputMode="decimal" min={0} step="0.01" value={line.salaryMax} onChange={(e) => set({ salaryMax: e.target.value })} />)}
        {field("salaryCurrency", "Currency", <CurrencySelect {...aria("salaryCurrency")} options={currencies} value={line.salaryCurrency} onValueChange={(v) => set({ salaryCurrency: v })} placeholder="Choose" allowClear />)}
        {field("salaryPeriod", "Pay period", <SimpleSelect {...aria("salaryPeriod")} options={salaryPeriodOptions} value={line.salaryPeriod} onValueChange={(v) => set({ salaryPeriod: v })} placeholder="Choose" allowClear />)}
      </div>
      {field(
        "requiredSkills",
        "Required skills",
        <TagInput {...aria("requiredSkills")} value={line.requiredSkills} onChange={(tags) => set({ requiredSkills: tags })} maxTags={30} maxLength={80} placeholder="Add a skill and press Enter" />,
      )}
      {field("notes", "Notes for this trade", <Textarea {...aria("notes")} value={line.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={2000} />)}
    </li>
  );
}

/** Repeatable trade lines; posts `lines:json`. */
export function RequirementLinesEditor({
  defaultLines,
  categories,
  currencies,
  fieldErrors,
  defaultCurrency,
}: {
  defaultLines: RequirementLineDraft[];
  categories: SelectOption[];
  currencies: SelectOption[];
  fieldErrors?: Record<string, string[]>;
  defaultCurrency?: string;
}) {
  const [lines, setLines] = useState<RequirementLineDraft[]>(defaultLines.length ? defaultLines : [emptyLine(defaultCurrency)]);
  const errorsFor = (i: number): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
      const m = /^lines\.(\d+)\.([A-Za-z]+)/.exec(key);
      if (m && Number(m[1]) === i && messages[0]) out[m[2]!] = messages[0];
    }
    return out;
  };
  const listError = fieldErrors?.lines?.[0];
  const total = lines.reduce((sum, l) => sum + (Number.parseInt(l.positions, 10) || 0), 0);

  return (
    <div className="space-y-4">
      <input type="hidden" name="lines:json" value={JSON.stringify(serializeLines(lines))} />
      {listError ? (
        <p className="text-sm font-medium text-danger-strong" role="alert">
          {listError}
        </p>
      ) : null}
      <ol className="space-y-4">
        {lines.map((l, i) => (
          <LineEditor
            key={l.key}
            line={l}
            index={i}
            canRemove={lines.length > 1}
            categories={categories}
            currencies={currencies}
            errors={errorsFor(i)}
            onChange={(next) => setLines((cur) => cur.map((x) => (x.key === l.key ? next : x)))}
            onRemove={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
          />
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((cur) => [...cur, emptyLine(cur.at(-1)?.salaryCurrency ?? defaultCurrency)])} disabled={lines.length >= 50}>
          <Plus aria-hidden="true" /> Add another trade
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {lines.length} trade{lines.length === 1 ? "" : "s"} · {total} position{total === 1 ? "" : "s"} in total
        </p>
      </div>
    </div>
  );
}
