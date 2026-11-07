import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type KeyValueItem = {
  label: ReactNode;
  value: ReactNode;
  /** Helper text under the value (e.g. "Visible to employers you apply to"). */
  hint?: ReactNode;
  /** Span the full row in multi-column layouts (long text, addresses). */
  fullWidth?: boolean;
  /** Stable key when labels are not plain strings. */
  key?: string;
};

type KeyValueListProps = {
  items: KeyValueItem[];
  /** 1–3 columns on wide screens; always one column on phones. */
  columns?: 1 | 2 | 3;
  /** stacked: label above value. inline: label and value side by side from `sm` up. */
  layout?: "stacked" | "inline";
  /** Text shown for empty values (null, undefined, ""). Defaults to "Not provided". */
  emptyText?: string;
  dense?: boolean;
  className?: string;
};

const COLUMN_CLASSES: Record<NonNullable<KeyValueListProps["columns"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

function isEmptyValue(value: ReactNode): boolean {
  return value === null || value === undefined || value === false || (typeof value === "string" && value.trim() === "");
}

/**
 * Semantic description list (<dl>) for record details.
 *
 *   <KeyValueList columns={2} items={[{ label: "Code", value: job.code }, { label: "Location", value: job.city }]} />
 */
export function KeyValueList({ items, columns = 1, layout = "stacked", emptyText = "Not provided", dense = false, className }: KeyValueListProps) {
  return (
    <dl data-slot="key-value-list" className={cn("grid gap-x-6", dense ? "gap-y-3" : "gap-y-4", COLUMN_CLASSES[columns], className)}>
      {items.map((item, i) => {
        const empty = isEmptyValue(item.value);
        return (
          <div
            key={item.key ?? (typeof item.label === "string" ? item.label : i)}
            className={cn(
              "min-w-0",
              layout === "inline" && "sm:grid sm:grid-cols-[minmax(8rem,14rem)_1fr] sm:gap-4",
              item.fullWidth && columns > 1 && "sm:col-span-full",
            )}
          >
            <dt className="text-sm font-medium text-muted-foreground">{item.label}</dt>
            <dd className={cn("mt-1 text-sm break-words text-foreground", layout === "inline" && "sm:mt-0")}>
              {empty ? <span className="text-muted-foreground">{emptyText}</span> : item.value}
              {item.hint ? <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
