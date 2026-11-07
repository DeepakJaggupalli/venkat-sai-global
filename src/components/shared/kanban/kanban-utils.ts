/**
 * Pure board helpers for KanbanBoard (client-safe, unit-tested). Items live in one flat array; their
 * order within a column is their order in the array, which makes optimistic updates and rollbacks a
 * simple array swap.
 */
export type KanbanItemBase = { id: string; columnId: string };

export type KanbanMove = {
  itemId: string;
  fromColumnId: string;
  toColumnId: string;
  /** Zero-based position within the target column after the move. */
  toIndex: number;
};

/** Items of one column, in board order. */
export function columnItems<T extends KanbanItemBase>(items: readonly T[], columnId: string): T[] {
  return items.filter((i) => i.columnId === columnId);
}

/** Position of an item within its column (-1 when missing). */
export function indexInColumn<T extends KanbanItemBase>(items: readonly T[], itemId: string): number {
  const item = items.find((i) => i.id === itemId);
  if (!item) return -1;
  return columnItems(items, item.columnId).findIndex((i) => i.id === itemId);
}

/**
 * Move an item to `toIndex` within `toColumnId` (clamped), returning a new array. Other items keep
 * their relative order. Unknown items return the input unchanged.
 */
export function moveItem<T extends KanbanItemBase>(items: readonly T[], itemId: string, toColumnId: string, toIndex: number): T[] {
  const item = items.find((i) => i.id === itemId);
  if (!item) return [...items];
  const rest = items.filter((i) => i.id !== itemId);
  const moved = { ...item, columnId: toColumnId };
  const target = rest.filter((i) => i.columnId === toColumnId);
  const index = Math.max(0, Math.min(toIndex, target.length));
  if (target.length === 0) {
    // Empty column: append at the end of the array (column order is defined by `columns`, not by items).
    return [...rest, moved];
  }
  if (index >= target.length) {
    const last = target[target.length - 1] as T;
    const at = rest.indexOf(last) + 1;
    return [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  const before = target[index] as T;
  const at = rest.indexOf(before);
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** Did a move change anything? */
export function isNoopMove<T extends KanbanItemBase>(items: readonly T[], move: KanbanMove): boolean {
  return move.fromColumnId === move.toColumnId && indexInColumn(items, move.itemId) === move.toIndex;
}

/** Count items per column (columns with no items report 0). */
export function countByColumn<T extends KanbanItemBase>(items: readonly T[], columnIds: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(columnIds.map((id) => [id, 0]));
  for (const item of items) counts[item.columnId] = (counts[item.columnId] ?? 0) + 1;
  return counts;
}
