"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { GENERIC_ERROR, interpretOutcome, isNavigationError } from "../form/action-result";
import { COLUMN_PREFIX, KanbanCardView, KanbanColumnView, type KanbanColumnDef } from "./kanban-parts";
import { columnItems, countByColumn, indexInColumn, isNoopMove, moveItem, type KanbanItemBase, type KanbanMove } from "./kanban-utils";

export type { KanbanColumnDef } from "./kanban-parts";
export type { KanbanItemBase, KanbanMove } from "./kanban-utils";

type KanbanBoardProps<T extends KanbanItemBase> = {
  columns: KanbanColumnDef[];
  items: T[];
  /** Card body (title, meta, badges). Interactive content inside cards stays clickable. */
  renderCard: (item: T) => ReactNode;
  /** Short name used in announcements and menus, e.g. the candidate's name. */
  getItemLabel: (item: T) => string;
  /**
   * Persist a move (usually a Server Action). Return an ActionResult or `false` to reject — the card
   * snaps back and the error is shown. Authorisation and transition rules must be enforced server-side.
   */
  onMove: (move: KanbanMove, item: T) => unknown | Promise<unknown>;
  /** Client-side hint for allowed moves (disables menu items and rejects drops). */
  canMove?: (item: T, toColumnId: string) => boolean;
  /** Accessible name of the board, e.g. "Applicants pipeline". */
  label: string;
  emptyColumnText?: string;
  /** Toast after a successful move when the result has no message (false = no toast). */
  successMessage?: string | false;
  className?: string;
};

/**
 * Generic, keyboard-accessible board (dnd-kit) with optimistic moves and rollback on failure. Every
 * card also has a "Move to" menu — the single-pointer and screen-reader friendly alternative to drag
 * and drop (WCAG 2.5.7), and the main interaction on phones.
 *
 *   <KanbanBoard label="Applicants pipeline" columns={stages} items={applications}
 *     getItemLabel={(a) => a.candidateName} renderCard={(a) => <ApplicantCard a={a} />}
 *     onMove={(move) => moveApplication({ applicationId: move.itemId, stageId: move.toColumnId })} />
 */
export function KanbanBoard<T extends KanbanItemBase>({
  columns,
  items,
  renderCard,
  getItemLabel,
  onMove,
  canMove,
  label,
  emptyColumnText = "Nothing here yet",
  successMessage = false,
  className,
}: KanbanBoardProps<T>) {
  const [board, setBoard] = useState<T[]>(items);
  const [syncedItems, setSyncedItems] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [, startTransition] = useTransition();
  const snapshot = useRef<T[] | null>(null);
  const origin = useRef<{ columnId: string; index: number } | null>(null);
  const dndId = useId();

  // Server data wins whenever new items arrive (e.g. after revalidatePath).
  if (items !== syncedItems) {
    setSyncedItems(items);
    setBoard(items);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnTitle = (id: string | null | undefined) => columns.find((c) => c.id === id)?.title ?? "another column";
  const itemById = (id: UniqueIdentifier, list: T[] = board) => list.find((i) => i.id === String(id));
  const columnOf = (id: UniqueIdentifier, list: T[] = board): string | null => {
    const key = String(id);
    if (key.startsWith(COLUMN_PREFIX)) return key.slice(COLUMN_PREFIX.length);
    return itemById(key, list)?.columnId ?? null;
  };
  const allowed = (item: T | undefined, toColumnId: string) => Boolean(item) && (!canMove || canMove(item as T, toColumnId));

  const commit = (move: KanbanMove, previous: T[], item: T) => {
    setPendingIds((ids) => [...ids, move.itemId]);
    startTransition(async () => {
      try {
        const outcome = interpretOutcome(await onMove(move, item));
        if (!outcome.ok) {
          setBoard(previous);
          toast.error(outcome.error);
          setLiveMessage(`${getItemLabel(item)} could not be moved and is back in ${columnTitle(move.fromColumnId)}.`);
          return;
        }
        const message = outcome.message ?? (successMessage === false ? undefined : successMessage);
        if (message) toast.success(message);
      } catch (err) {
        if (isNavigationError(err)) throw err;
        setBoard(previous);
        toast.error(GENERIC_ERROR);
      } finally {
        setPendingIds((ids) => ids.filter((x) => x !== move.itemId));
      }
    });
  };

  const moveViaMenu = (item: T, toColumnId: string) => {
    if (!allowed(item, toColumnId)) return;
    const previous = board;
    const next = moveItem(board, item.id, toColumnId, Number.MAX_SAFE_INTEGER);
    const move: KanbanMove = { itemId: item.id, fromColumnId: item.columnId, toColumnId, toIndex: indexInColumn(next, item.id) };
    setBoard(next);
    setLiveMessage(`${getItemLabel(item)} moved to ${columnTitle(toColumnId)}.`);
    commit(move, previous, item);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    snapshot.current = board;
    const item = itemById(active.id);
    origin.current = item ? { columnId: item.columnId, index: indexInColumn(board, item.id) } : null;
    setActiveId(String(active.id));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = columnOf(active.id);
    const to = columnOf(over.id);
    if (!from || !to || from === to || !allowed(itemById(active.id), to)) return;
    setBoard((prev) => {
      const overIndex = String(over.id).startsWith(COLUMN_PREFIX) ? Number.MAX_SAFE_INTEGER : indexInColumn(prev, String(over.id));
      return moveItem(prev, String(active.id), to, overIndex < 0 ? Number.MAX_SAFE_INTEGER : overIndex);
    });
  };

  const restore = () => {
    if (snapshot.current) setBoard(snapshot.current);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const before = snapshot.current;
    const start = origin.current;
    snapshot.current = null;
    origin.current = null;
    const item = before ? itemById(active.id, before) : undefined;
    const to = over ? columnOf(over.id) : null;
    if (!over || !before || !start || !item || !to || !allowed(item, to)) {
      if (before) setBoard(before);
      return;
    }
    const overIsColumn = String(over.id).startsWith(COLUMN_PREFIX);
    const targetIndex = overIsColumn ? Number.MAX_SAFE_INTEGER : indexInColumn(board, String(over.id));
    const next = moveItem(board, item.id, to, targetIndex < 0 ? Number.MAX_SAFE_INTEGER : targetIndex);
    const move: KanbanMove = { itemId: item.id, fromColumnId: start.columnId, toColumnId: to, toIndex: indexInColumn(next, item.id) };
    if (isNoopMove(before, move)) {
      setBoard(before);
      return;
    }
    setBoard(next);
    commit(move, before, item);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const item = itemById(active.id);
      return item ? `Picked up ${getItemLabel(item)} in ${columnTitle(item.columnId)}.` : undefined;
    },
    onDragOver: ({ active, over }) => {
      const item = itemById(active.id);
      if (!item || !over) return undefined;
      const col = columnOf(over.id);
      const position = indexInColumn(board, item.id) + 1;
      return `${getItemLabel(item)} is over ${columnTitle(col)}, position ${Math.max(1, position)} of ${columnItems(board, col ?? "").length}.`;
    },
    onDragEnd: ({ active, over }) => {
      const item = itemById(active.id);
      if (!item) return undefined;
      return over ? `${getItemLabel(item)} dropped in ${columnTitle(columnOf(over.id))}.` : `${getItemLabel(item)} dropped. No change.`;
    },
    onDragCancel: ({ active }) => {
      const item = itemById(active.id, snapshot.current ?? board);
      return item ? `Moving cancelled. ${getItemLabel(item)} returned to ${columnTitle(item.columnId)}.` : undefined;
    },
  };

  const counts = countByColumn(board, columns.map((c) => c.id));
  const activeItem = activeId ? itemById(activeId) : undefined;

  return (
    <div role="region" aria-label={label} data-slot="kanban-board" className={cn("min-w-0", className)}>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          restore();
          setActiveId(null);
        }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To move a card, press Space or Enter on its drag handle, use the arrow keys to choose a column and position, then press Space or Enter to drop it, or Escape to cancel. You can also use the Move to menu on each card.",
          },
        }}
      >
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {columns.map((column) => {
            const list = columnItems(board, column.id);
            return (
              <KanbanColumnView key={column.id} column={column} itemIds={list.map((i) => i.id)} count={counts[column.id] ?? 0} emptyText={emptyColumnText}>
                {list.map((item) => (
                  <KanbanCardView
                    key={item.id}
                    id={item.id}
                    label={getItemLabel(item)}
                    columnId={item.columnId}
                    columns={columns}
                    pending={pendingIds.includes(item.id)}
                    canMoveTo={(to) => allowed(item, to)}
                    onMoveTo={(to) => moveViaMenu(item, to)}
                  >
                    {renderCard(item)}
                  </KanbanCardView>
                ))}
              </KanbanColumnView>
            );
          })}
        </div>
        <DragOverlay>
          {activeItem ? <div className="rounded-lg border border-teal/40 bg-card p-3 shadow-lg">{renderCard(activeItem)}</div> : null}
        </DragOverlay>
      </DndContext>
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>
    </div>
  );
}
