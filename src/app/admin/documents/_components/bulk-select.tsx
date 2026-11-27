"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";

export type BulkAction = {
  label: string;
  // Any server action taking `{ ids, ...extra }` (typed as never so each action keeps its own input type).
  action: (input: never) => Promise<ActionResult<unknown>>;
  extra?: Record<string, string>;
  variant?: "default" | "outline";
  /** Asked with window.confirm before running (keep it short). */
  confirm?: string;
  testId?: string;
};

/**
 * A list of rows with checkboxes and a toolbar of bulk actions (approve many documents, mark many interns finished).
 * Row content is rendered on the server and passed in.
 */
export function BulkSelect({ rows, actions, label, testId }: { rows: { id: string; content: ReactNode }[]; actions: BulkAction[]; label: string; testId?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const all = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(a: BulkAction) {
    const ids = [...selected];
    if (!ids.length || pending) return;
    if (a.confirm && !window.confirm(a.confirm.replace("{n}", String(ids.length)))) return;
    start(async () => {
      const result = await (a.action as (input: unknown) => Promise<ActionResult<unknown>>)({ ...(a.extra ?? {}), ids });
      if (result.ok) {
        toast.success(result.message ?? "Done");
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div data-testid={testId} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-subtle px-4 py-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-teal)]"
            checked={all}
            onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))}
            aria-label={`Select all ${label}`}
          />
          {selected.size ? `${selected.size} selected` : "Select all"}
        </label>
        <div className="ms-auto flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.label} size="sm" variant={a.variant ?? "default"} disabled={!selected.size || pending} onClick={() => run(a)} data-testid={a.testId}>
              {pending ? "Working…" : a.label}
            </Button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-[var(--brand-teal)]"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              aria-label={`Select ${label} row`}
              data-testid="bulk-row-checkbox"
            />
            <div className="min-w-0 flex-1">{r.content}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
