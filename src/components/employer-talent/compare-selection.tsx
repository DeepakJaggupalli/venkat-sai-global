"use client";

import { GitCompareArrows, X } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { AddToListDialog, type ListChoice } from "./add-to-list-dialog";
import { MAX_COMPARE, toggleCompare } from "./labels";

type Selection = { ids: string[]; names: Record<string, string>; toggle: (id: string, name: string) => void; clear: () => void };

const SelectionContext = createContext<Selection | null>(null);

/** Holds the candidates picked for comparison / bulk "add to list" on the search page (max four). */
export function CompareSelectionProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const value = useMemo<Selection>(
    () => ({
      ids,
      names,
      toggle: (id, name) => {
        const { next, rejected } = toggleCompare(ids, id);
        if (rejected) {
          toast.error(`You can compare up to ${MAX_COMPARE} candidates.`);
          return;
        }
        setIds(next);
        setNames((n) => ({ ...n, [id]: name }));
      },
      clear: () => setIds([]),
    }),
    [ids, names],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function CompareToggle({ candidateId, name }: { candidateId: string; name: string }) {
  const ctx = useContext(SelectionContext);
  const id = useId();
  if (!ctx) return null;
  const checked = ctx.ids.includes(candidateId);
  return (
    <label htmlFor={id} className="relative z-10 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <input id={id} type="checkbox" checked={checked} onChange={() => ctx.toggle(candidateId, name)} className="size-4" data-testid="compare-toggle" />
      Compare<span className="sr-only"> {name}</span>
    </label>
  );
}

/** Sticky bar shown once at least one candidate is selected. */
export function CompareBar({ lists, canUseLists }: { lists: ListChoice[]; canUseLists: boolean }) {
  const ctx = useContext(SelectionContext);
  if (!ctx || ctx.ids.length === 0) return null;
  const compareHref = `/employer/candidates/compare?ids=${ctx.ids.join(",")}`;
  return (
    <div role="region" aria-label="Selected candidates" className="sticky bottom-3 z-20 mt-4 rounded-xl border bg-card p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium" aria-live="polite">
          {ctx.ids.length} of {MAX_COMPARE} selected
          <span className="hidden text-muted-foreground sm:inline"> · {ctx.ids.map((i) => ctx.names[i]).filter(Boolean).join(", ")}</span>
        </p>
        {canUseLists ? <AddToListDialog candidateIds={ctx.ids} lists={lists} onDone={ctx.clear} /> : null}
        {ctx.ids.length >= 2 ? (
          <Button asChild size="sm">
            <Link href={compareHref}>
              <GitCompareArrows aria-hidden className="size-4" />
              Compare
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Select one more to compare</span>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={ctx.clear}>
          <X aria-hidden className="size-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}
