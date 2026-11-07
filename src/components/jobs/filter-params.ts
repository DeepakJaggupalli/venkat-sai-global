/**
 * URL contract of the job search filters (client-safe, pure). The jobs module parses these with
 * `parseJobSearchParams()`; this file only decides which names the filter controls write and how they
 * read values back (short aliases such as `type` / `country`, repeated or comma-separated values).
 */

/** Multi-value filters: the param the UI writes, plus the canonical name the parser also accepts. */
export const MULTI_FILTERS = {
  category: "categoryIds",
  country: "countryCodes",
  industry: "industryIds",
  type: "employmentTypes",
  mode: "workModes",
  experienceLevels: "experienceLevels",
} as const;
export type MultiFilterParam = keyof typeof MULTI_FILTERS;

/** Single-value filters written as-is. */
export const SINGLE_FILTERS = [
  "q",
  "location",
  "experienceYears",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryPeriod",
  "educationLevelId",
  "postedWithinDays",
  "closingWithinDays",
] as const;

/** Boolean filters ("1" when on). */
export const FLAG_FILTERS = ["verifiedOnly", "overseas", "featuredOnly"] as const;
export type FlagFilterParam = (typeof FLAG_FILTERS)[number];

/** Every param a "Clear all filters" action removes (aliases and canonical names). */
export const ALL_FILTER_PARAMS: readonly string[] = [
  ...Object.keys(MULTI_FILTERS),
  ...Object.values(MULTI_FILTERS),
  ...SINGLE_FILTERS,
  ...FLAG_FILTERS,
  "page",
];

/** Params that narrow the results (keywords excluded) — used for counts and analytics. */
const NARROWING_PARAMS: readonly string[] = [...Object.keys(MULTI_FILTERS), ...Object.values(MULTI_FILTERS), ...SINGLE_FILTERS.filter((k) => k !== "q"), ...FLAG_FILTERS];

export const POSTED_WITHIN_OPTIONS = [1, 3, 7, 14, 30] as const;
export const CLOSING_WITHIN_OPTIONS = [3, 7, 14, 30] as const;

type ParamReader = { getAll: (key: string) => string[]; get: (key: string) => string | null | undefined };

function split(values: string[]): string[] {
  return values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

/** Values of a multi-value filter from either its alias or canonical name, deduplicated. */
export function readMulti(params: ParamReader, param: MultiFilterParam): string[] {
  const canonical = MULTI_FILTERS[param];
  const values = split([...params.getAll(param), ...(canonical !== param ? params.getAll(canonical) : [])]);
  return [...new Set(values)];
}

export function isFlagOn(value: string | null | undefined): boolean {
  return value === "1" || value === "true" || value === "on";
}

/**
 * Patch for toggling one value of a multi-value filter: writes the alias, drops the canonical name so
 * the two never disagree.
 */
export function toggleMultiPatch(params: ParamReader, param: MultiFilterParam, value: string, on: boolean): Record<string, string[] | null> {
  const current = readMulti(params, param);
  const next = on ? [...new Set([...current, value])] : current.filter((v) => v !== value);
  const canonical = MULTI_FILTERS[param];
  return { [param]: next.length ? next : null, ...(canonical !== param ? { [canonical]: null } : {}) };
}

/** Names (never values) of the narrowing filters in use, e.g. "country,type" — safe for analytics. */
export function activeFilterNames(params: ParamReader): string[] {
  const names = new Set<string>();
  for (const key of NARROWING_PARAMS) {
    const values = split(params.getAll(key));
    if (!values.length) continue;
    const alias = (Object.entries(MULTI_FILTERS).find(([, canonical]) => canonical === key)?.[0] ?? key) as string;
    if ((FLAG_FILTERS as readonly string[]).includes(key) && !isFlagOn(values[0])) continue;
    names.add(alias.startsWith("salary") ? "salary" : alias);
  }
  return [...names].sort();
}

/** Number of filter groups in use (keywords excluded). */
export function activeFilterCount(params: ParamReader): number {
  return activeFilterNames(params).length;
}

/** Adapter for a plain search-params record (server pages). */
export function recordReader(params: Record<string, string | string[] | undefined>): ParamReader {
  return {
    getAll: (key) => {
      const v = params[key];
      return v === undefined ? [] : Array.isArray(v) ? v : [v];
    },
    get: (key) => {
      const v = params[key];
      return Array.isArray(v) ? v[0] : v;
    },
  };
}
