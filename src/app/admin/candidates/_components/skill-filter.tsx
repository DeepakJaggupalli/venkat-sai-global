"use client";

import { useUrlFilters } from "@/components/shared/filters";
import { SkillPicker } from "@/components/shared/skill-picker";
import type { SelectOption } from "@/components/shared/types";
import { Label } from "@/components/ui/label";

/** URL-synced skill filter (comma-separated `skillIds`) built on the shared SkillPicker. */
export function SkillFilter({ selected }: { selected: SelectOption[] }) {
  const { setParam } = useUrlFilters();
  return (
    <div className="grid min-w-56 gap-1.5">
      <Label htmlFor="skill-filter">Skills</Label>
      <SkillPicker
        id="skill-filter"
        name="skillFilter"
        defaultValue={selected}
        placeholder="Any skill"
        maxSelected={10}
        onChange={(options) => setParam("skillIds", options.length ? options.map((o) => o.value).join(",") : null)}
      />
    </div>
  );
}
