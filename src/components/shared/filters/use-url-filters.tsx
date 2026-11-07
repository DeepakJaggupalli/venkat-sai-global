"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useTransition, type ReactNode, type TransitionStartFunction } from "react";

import { cn } from "@/lib/utils";

import { buildHref, DEFAULT_RESET_KEYS, patchSearchParams, type ParamPatch } from "../url-state";

type FilterScopeValue = { isPending: boolean; startTransition: TransitionStartFunction };

const FilterScopeContext = createContext<FilterScopeValue | null>(null);

/**
 * Shares one navigation transition between every filter control and the results it scopes, so the
 * results can dim while the server re-renders (instead of flashing a skeleton).
 *
 *   <FilterScope>
 *     <FilterBar …/>
 *     <FilterPendingRegion><DataTable …/></FilterPendingRegion>
 *   </FilterScope>
 */
export function FilterScope({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return <FilterScopeContext.Provider value={{ isPending, startTransition }}>{children}</FilterScopeContext.Provider>;
}

/** Dims its children and marks them busy while a filter navigation is in flight. */
export function FilterPendingRegion({ children, className }: { children: ReactNode; className?: string }) {
  const scope = useContext(FilterScopeContext);
  const pending = scope?.isPending ?? false;
  return (
    <div aria-busy={pending || undefined} data-pending={pending || undefined} className={cn("transition-opacity duration-200", pending && "opacity-60", className)}>
      {children}
    </div>
  );
}

export type UrlFilters = {
  /** Current params snapshot. */
  searchParams: URLSearchParams;
  get: (key: string) => string | undefined;
  getAll: (key: string) => string[];
  /** Apply a patch (null/""/[] removes a key). Resets `page` unless the patch sets it. */
  setParams: (patch: ParamPatch) => void;
  setParam: (key: string, value: string | string[] | null) => void;
  /** Remove the given keys. */
  reset: (keys: readonly string[]) => void;
  isPending: boolean;
};

/**
 * Read and update URL search params from client filter controls. Navigation uses
 * `router.replace(…, { scroll: false })` inside a transition, so typing never pushes history entries
 * and the page keeps its scroll position.
 */
export function useUrlFilters(opts: { resetKeys?: readonly string[] } = {}): UrlFilters {
  const router = useRouter();
  const pathname = usePathname();
  const readonlyParams = useSearchParams();
  const scope = useContext(FilterScopeContext);
  const [localPending, localStart] = useTransition();
  const startTransition = scope?.startTransition ?? localStart;
  const isPending = scope?.isPending ?? localPending;
  const query = readonlyParams.toString();
  const resetKeys = opts.resetKeys ?? DEFAULT_RESET_KEYS;

  const setParams = useCallback(
    (patch: ParamPatch) => {
      // Read the live URL rather than the render snapshot: debounced callbacks (search input) may fire
      // after another control has already changed the query, and must not undo that change.
      const live = typeof window !== "undefined" ? window.location.search : query;
      const next = patchSearchParams(live, patch, { resetKeys });
      const href = buildHref(pathname, next);
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [query, pathname, router, startTransition, resetKeys],
  );

  const searchParams = new URLSearchParams(query);
  return {
    searchParams,
    get: (key) => {
      const v = searchParams.get(key);
      return v && v.trim() !== "" ? v : undefined;
    },
    getAll: (key) => searchParams.getAll(key).filter((v) => v.trim() !== ""),
    setParams,
    setParam: (key, value) => setParams({ [key]: value }),
    reset: (keys) => setParams(Object.fromEntries(keys.map((k) => [k, null]))),
    isPending,
  };
}
