/**
 * Pure row-selection helpers for SelectableDataTable (client-safe, unit-tested).
 */
export type SelectionState = "none" | "some" | "all";

export function selectionState(selectableIds: readonly string[], selected: readonly string[]): SelectionState {
  if (selectableIds.length === 0) return "none";
  const chosen = new Set(selected);
  const count = selectableIds.reduce((n, id) => (chosen.has(id) ? n + 1 : n), 0);
  if (count === 0) return "none";
  return count === selectableIds.length ? "all" : "some";
}

/** Header checkbox: select every selectable row, or clear when all are already selected. */
export function toggleAll(selectableIds: readonly string[], selected: readonly string[]): string[] {
  return selectionState(selectableIds, selected) === "all" ? [] : [...selectableIds];
}

export function toggleOne(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}
