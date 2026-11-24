"use client";

import { useUrlFilters } from "@/components/shared/filters";
import { SearchableSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Label } from "@/components/ui/label";

/** Who pays: a travel agency or company. The choice lives in the URL (?org=) so the page reloads its workers. */
export function OrganizationPicker({ options, value }: { options: SelectOption[]; value: string | null }) {
  const filters = useUrlFilters();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="worker-invoice-org">Travel agency or company</Label>
      <SearchableSelect
        id="worker-invoice-org"
        options={options}
        value={value ?? ""}
        onValueChange={(next) => filters.setParams({ org: next || null, q: null, requirement: null, placed: null })}
        placeholder="Choose who pays…"
        searchPlaceholder="Type a name…"
        emptyText="No travel agency or company with that name."
        className="h-11"
      />
      {filters.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      ) : null}
    </div>
  );
}
