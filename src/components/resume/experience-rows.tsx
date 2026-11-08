"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { experienceMonths, formatExperienceTotal } from "@/modules/resume-service/experience";
import { MAX_EXPERIENCE_ROWS } from "@/modules/resume-service/schemas";

export type ExperienceDraft = { organisation: string; location: string; from: string; to: string; current: boolean; designation: string };

export const EMPTY_EXPERIENCE: ExperienceDraft = { organisation: "", location: "", from: "", to: "", current: false, designation: "" };

const INPUT = "h-11 text-base";

function FieldErrorText({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm text-danger-strong">
      {errors[0]}
    </p>
  );
}

/**
 * Repeatable experience rows (organisation, city/country, from, to or "still working here", designation) with the
 * running total in years and months, as printed on the resume.
 */
export function ExperienceRowsEditor({
  legend,
  description,
  rows,
  onChange,
  errorsFor,
  totalStyle,
}: {
  legend: string;
  description: string;
  rows: ExperienceDraft[];
  onChange: (rows: ExperienceDraft[]) => void;
  /** Errors for `<index>.<field>`. */
  errorsFor: (path: string) => string[] | undefined;
  totalStyle: "title" | "upper";
}) {
  const id = useId();
  const valid = rows.filter((r) => r.from && (r.current || r.to)).map((r) => ({ from: r.from, to: r.current ? null : r.to, current: r.current }));
  const total = formatExperienceTotal(experienceMonths(valid, new Date()), totalStyle);
  const update = (index: number, patch: Partial<ExperienceDraft>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <fieldset className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
      <legend className="px-1 font-heading text-base font-semibold text-navy">{legend}</legend>
      <p className="text-sm text-muted-foreground">
        {description}
        {total ? (
          <>
            {" "}
            Total: <strong className="font-semibold text-foreground">{total}</strong>
          </>
        ) : null}
      </p>
      {rows.map((row, index) => {
        const field = (name: keyof ExperienceDraft) => `${id}-${index}-${name}`;
        const err = (name: keyof ExperienceDraft) => errorsFor(`${index}.${name}`);
        return (
          <div key={index} className="space-y-3 rounded-lg bg-surface-subtle p-3 sm:p-4" data-testid="experience-row">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Job {index + 1}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                <Trash2 aria-hidden="true" />
                Remove
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={field("organisation")}>Company name *</Label>
                <Input id={field("organisation")} value={row.organisation} maxLength={160} className={INPUT} aria-invalid={Boolean(err("organisation"))} aria-describedby={`${field("organisation")}-e`} onChange={(e) => update(index, { organisation: e.target.value })} />
                <FieldErrorText id={`${field("organisation")}-e`} errors={err("organisation")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={field("location")}>City and country</Label>
                <Input id={field("location")} value={row.location} maxLength={120} placeholder="For example: Jubail, Saudi Arabia" className={INPUT} onChange={(e) => update(index, { location: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={field("from")}>From *</Label>
                <Input id={field("from")} type="date" value={row.from} className={INPUT} aria-invalid={Boolean(err("from"))} aria-describedby={`${field("from")}-e`} onChange={(e) => update(index, { from: e.target.value })} />
                <FieldErrorText id={`${field("from")}-e`} errors={err("from")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={field("to")}>To {row.current ? "" : "*"}</Label>
                <Input id={field("to")} type="date" value={row.current ? "" : row.to} disabled={row.current} className={INPUT} aria-invalid={Boolean(err("to"))} aria-describedby={`${field("to")}-e`} onChange={(e) => update(index, { to: e.target.value })} />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={row.current} onChange={(e) => update(index, { current: e.target.checked })} className="size-4" />
                  I still work here
                </label>
                <FieldErrorText id={`${field("to")}-e`} errors={err("to")} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={field("designation")}>Designation *</Label>
                <Input id={field("designation")} value={row.designation} maxLength={120} placeholder="For example: TIG Welder" className={INPUT} aria-invalid={Boolean(err("designation"))} aria-describedby={`${field("designation")}-e`} onChange={(e) => update(index, { designation: e.target.value })} />
                <FieldErrorText id={`${field("designation")}-e`} errors={err("designation")} />
              </div>
            </div>
          </div>
        );
      })}
      {rows.length < MAX_EXPERIENCE_ROWS ? (
        <Button type="button" variant="outline" onClick={() => onChange([...rows, { ...EMPTY_EXPERIENCE }])}>
          <Plus aria-hidden="true" />
          Add a job
        </Button>
      ) : null}
    </fieldset>
  );
}
