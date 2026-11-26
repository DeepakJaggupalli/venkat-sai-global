import Link from "next/link";

import { cn } from "@/lib/utils";

export type RankedBar = {
  key: string;
  label: string;
  value: number;
  href?: string | null;
};

/** Bar width in percent of the largest value (at least a sliver for any non-zero value, so it stays visible). */
export function barPercent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}

/**
 * A list with one accent bar per row: top trades, top countries (ranked, numbered), or stages in their own order
 * (ranked={false}). Every row is a real count and, when it has an href, a link to the list behind it. The label and
 * the number are text; the bar is decoration. Server component.
 */
export function RankedBars({
  items,
  unit,
  ranked = true,
  className,
}: {
  items: readonly RankedBar[];
  unit: { one: string; many: string };
  ranked?: boolean;
  className?: string;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  return (
    <ol className={cn("space-y-1", className)}>
      {items.map((item, index) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-foreground min-w-0 truncate text-sm font-semibold">
                {ranked ? (
                  <span aria-hidden="true" className="text-muted-foreground mr-2 inline-block w-4 text-right text-xs font-semibold tabular-nums">
                    {index + 1}
                  </span>
                ) : null}
                {item.label}
              </span>
              <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
                {item.value}
                <span className="sr-only"> {item.value === 1 ? unit.one : unit.many}</span>
              </span>
            </span>
            <span aria-hidden="true" className={cn("bg-surface-subtle mt-1.5 block h-2 overflow-hidden rounded-full", ranked && "ml-6")}>
              <span className="bg-accent-fill block h-full rounded-full" style={{ width: `${barPercent(item.value, max)}%` }} />
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className="hover:bg-surface-subtle focus-visible:outline-ring block min-h-11 rounded-xl px-2 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
              >
                {body}
              </Link>
            ) : (
              <div className="min-h-11 px-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
