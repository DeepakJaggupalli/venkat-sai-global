/**
 * Pure geography helpers for the Global Reach grouping (client-safe, no data access).
 * Flags are real SVG images: see components/public/flag.tsx (Windows cannot render flag emoji).
 */

/** The groups shown on /global-reach, in display order (spec: India, GCC, Europe, Asia-Pacific, Africa, North America, other). */
export const REACH_GROUPS = ["india", "gcc", "europe", "asia_pacific", "africa", "north_america", "other"] as const;
export type ReachGroup = (typeof REACH_GROUPS)[number];

export const REACH_GROUP_LABELS: Record<ReachGroup, string> = {
  india: "India",
  gcc: "GCC",
  europe: "Europe",
  asia_pacific: "Asia-Pacific",
  africa: "Africa",
  north_america: "North America",
  other: "Other regions",
};

export function reachGroupFor(region: string | null | undefined): ReachGroup {
  return (REACH_GROUPS as readonly string[]).includes(region ?? "") && region !== "other" ? (region as ReachGroup) : "other";
}

/** Groups items by reach group, keeping the input order inside each group and dropping empty groups. */
export function groupByReach<T>(items: readonly T[], regionOf: (item: T) => string | null | undefined): { group: ReachGroup; label: string; items: T[] }[] {
  const buckets = new Map<ReachGroup, T[]>();
  for (const item of items) {
    const group = reachGroupFor(regionOf(item));
    const list = buckets.get(group) ?? [];
    list.push(item);
    buckets.set(group, list);
  }
  return REACH_GROUPS.filter((g) => buckets.has(g)).map((group) => ({ group, label: REACH_GROUP_LABELS[group], items: buckets.get(group) ?? [] }));
}
