"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { CountrySelect } from "@/components/shared/selects";
import { SkillPicker } from "@/components/shared/skill-picker";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SkillDraft = { skillId: string; name: string; isRequired: boolean; minYears: number | null };
export type LocationDraft = { key: string; countryCode: string; stateRegion: string; city: string; openings: string };

function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="space-y-1" role="alert">
      {errors.map((e, i) => (
        <li key={i} className="text-sm font-medium text-danger-strong">
          {e}
        </li>
      ))}
    </ul>
  );
}

/** Skills with required / nice-to-have and minimum years; posts `skills:json`. */
export function SkillsEditor({ defaultSkills, errors, labelledBy }: { defaultSkills: SkillDraft[]; errors: string[]; labelledBy: string }) {
  const [skills, setSkills] = useState<SkillDraft[]>(defaultSkills);
  const uid = useId();
  const selected: SelectOption[] = skills.map((s) => ({ value: s.skillId, label: s.name }));

  function onSelect(next: SelectOption[]) {
    setSkills((current) => next.map((o) => current.find((s) => s.skillId === o.value) ?? { skillId: o.value, name: o.label, isRequired: true, minYears: null }));
  }
  const patch = (id: string, p: Partial<SkillDraft>) => setSkills((cur) => cur.map((s) => (s.skillId === id ? { ...s, ...p } : s)));

  return (
    <div className="space-y-3">
      <input type="hidden" name="skills:json" value={JSON.stringify(skills.map(({ skillId, isRequired, minYears }) => ({ skillId, isRequired, minYears })))} />
      <SkillPicker value={selected} onChange={onSelect} maxSelected={30} aria-labelledby={labelledBy} />
      <ErrorList errors={errors} />
      {skills.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {skills.map((s) => (
            <li key={s.skillId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium text-foreground">{s.name}</span>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    id={`${uid}-${s.skillId}-req`}
                    type="checkbox"
                    checked={s.isRequired}
                    onChange={(e) => patch(s.skillId, { isRequired: e.target.checked })}
                    className="size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <Label htmlFor={`${uid}-${s.skillId}-req`} className="font-normal">
                    Required
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${uid}-${s.skillId}-yrs`} className="font-normal">
                    Min. years
                  </Label>
                  <Input
                    id={`${uid}-${s.skillId}-yrs`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    className="w-20"
                    value={s.minYears ?? ""}
                    onChange={(e) => patch(s.skillId, { minYears: e.target.value === "" ? null : Math.max(0, Math.min(50, Number.parseInt(e.target.value, 10) || 0)) })}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setSkills((cur) => cur.filter((x) => x.skillId !== s.skillId))} aria-label={`Remove ${s.name}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

let seq = 0;
const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Additional work locations with optional openings each; posts `locations:json`. */
export function LocationsEditor({ defaultLocations, countries, errors }: { defaultLocations: LocationDraft[]; countries: SelectOption[]; errors: string[] }) {
  const [rows, setRows] = useState<LocationDraft[]>(defaultLocations);
  const uid = useId();
  const payload = rows
    .filter((r) => r.countryCode)
    .map((r) => ({ countryCode: r.countryCode, stateRegion: r.stateRegion.trim() || null, city: r.city.trim() || null, openings: r.openings ? Number(r.openings) : null }));
  const patch = (key: string, p: Partial<LocationDraft>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <div className="space-y-3">
      <input type="hidden" name="locations:json" value={JSON.stringify(payload)} />
      <ErrorList errors={errors} />
      {rows.map((r, i) => (
        <fieldset key={r.key} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_auto] sm:items-end">
          <legend className="sr-only">Additional location {i + 1}</legend>
          <div className="space-y-1.5">
            <Label id={`${uid}-${r.key}-country`}>Country</Label>
            <CountrySelect options={countries} value={r.countryCode} onValueChange={(v) => patch(r.key, { countryCode: v })} placeholder="Country" aria-label={`Country for location ${i + 1}`} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-${r.key}-state`}>State / region</Label>
            <Input id={`${uid}-${r.key}-state`} value={r.stateRegion} onChange={(e) => patch(r.key, { stateRegion: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-${r.key}-city`}>City</Label>
            <Input id={`${uid}-${r.key}-city`} value={r.city} onChange={(e) => patch(r.key, { city: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-${r.key}-open`}>Openings</Label>
            <Input id={`${uid}-${r.key}-open`} type="number" inputMode="numeric" min={1} value={r.openings} onChange={(e) => patch(r.key, { openings: e.target.value })} />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))} aria-label={`Remove location ${i + 1}`}>
            <Trash2 aria-hidden="true" />
          </Button>
        </fieldset>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setRows((cur) => [...cur, { key: newKey(), countryCode: "", stateRegion: "", city: "", openings: "" }])} disabled={rows.length >= 20}>
        <Plus aria-hidden="true" /> Add location
      </Button>
    </div>
  );
}
