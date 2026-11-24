import { ChevronDown } from "lucide-react";

import type { CvImportRowView } from "@/modules/operations/cv-import-schemas";

const TONE = {
  danger: "text-danger-strong",
  warning: "text-warning-strong",
  neutral: "text-muted-foreground",
} as const;

/**
 * One group of checked rows (ready, need fixing, repeated, already in the list) as a native disclosure: works without
 * JavaScript, one tap to open on a phone. Rows are short cards: Excel row, name, phone, trade, then reasons / notes.
 */
export function ImportRows({
  title,
  description,
  rows,
  total,
  reasonTone,
  defaultOpen = false,
  testId,
}: {
  title: string;
  description?: string;
  rows: CvImportRowView[];
  /** All rows of this kind (the list may be capped). */
  total: number;
  reasonTone: keyof typeof TONE;
  defaultOpen?: boolean;
  testId?: string;
}) {
  if (!total) return null;
  return (
    <details open={defaultOpen} className="group rounded-xl border border-border bg-card" data-testid={testId}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-base font-medium text-foreground hover:bg-surface-subtle [&::-webkit-details-marker]:hidden">
        <span>
          {title} <span className="tabular-nums text-muted-foreground">({total.toLocaleString("en-IN")})</span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-4 pb-4">
        {description ? <p className="pt-3 text-sm text-muted-foreground">{description}</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.row} className="py-3 text-sm">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">Row {r.row}</span>
                <span className="min-w-0 font-medium break-words text-foreground">{r.name || "No name"}</span>
              </p>
              <p className="mt-1 break-words text-muted-foreground">
                {[r.phone, r.trade ? `${r.trade}${r.trade && !r.tradeListed ? " (typed)" : ""}` : null, r.passportLast4 ? `Passport …${r.passportLast4}` : null].filter(Boolean).join(" · ")}
              </p>
              {r.reasons.length ? (
                <ul className={`mt-1 list-disc space-y-0.5 pl-5 ${TONE[reasonTone]}`}>
                  {r.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              {r.notes.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {r.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        {total > rows.length ? (
          <p className="pt-2 text-sm text-muted-foreground">
            Showing the first {rows.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}.
          </p>
        ) : null}
      </div>
    </details>
  );
}
