import "server-only";

/**
 * Small helpers shared by the reference-data seeds.
 */

export type SeedResult = { name: string; inserted: number; updated: number; total: number; note?: string };

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Throw when a natural key appears twice in seed data (catches copy/paste mistakes early). */
export function assertUnique<T>(items: readonly T[], key: (item: T) => string, label: string): void {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) dupes.add(k);
    seen.add(k);
  }
  if (dupes.size) throw new Error(`Duplicate ${label} in seed data: ${[...dupes].join(", ")}`);
}

/** A row returned with `(xmax = 0) as inserted` was inserted (otherwise the upsert updated it). */
export function wasInserted(row: { inserted: boolean | string | null }): boolean {
  return row.inserted === true || row.inserted === "t" || row.inserted === "true";
}

/** Count rows returned with `(xmax = 0) as inserted` (true = inserted, false = updated). */
export function countInserted(rows: readonly { inserted: boolean | string | null }[]): { inserted: number; updated: number } {
  const inserted = rows.filter(wasInserted).length;
  return { inserted, updated: rows.length - inserted };
}
