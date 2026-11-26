import type { ChecklistItem } from "./types";

/** Progress of a getting-started checklist (pure). `percent` is a whole number 0–100. */
export function checklistProgress(items: readonly Pick<ChecklistItem, "done">[]): { done: number; total: number; percent: number; complete: boolean } {
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);
  return { done, total, percent, complete: total === 0 || done === total };
}

/** The first item still to do (the "Next step" link), or null when all are done. */
export function nextChecklistItem<T extends Pick<ChecklistItem, "done">>(items: readonly T[]): T | null {
  return items.find((item) => !item.done) ?? null;
}
