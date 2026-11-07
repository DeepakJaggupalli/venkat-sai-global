"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RowControls = {
  /** Drag handle (pointer, touch and keyboard: Space to lift, arrows to move, Space to drop). */
  handle: ReactNode;
  /** Move up / down buttons (single-pointer alternative to dragging, WCAG 2.5.7). */
  moveButtons: ReactNode;
};

type Props = {
  ids: string[];
  /** Accessible names of the rows, in the same order (announcements and button labels). */
  labels: string[];
  onMove: (from: number, to: number) => void;
  renderRow: (index: number, controls: RowControls) => ReactNode;
  disabled?: boolean;
  className?: string;
  /** Name of the list for screen-reader announcements ("FAQs"). */
  listLabel: string;
};

function SortableRow({ id, label, disabled, children }: { id: string; label: string; disabled?: boolean; children: (handle: ReactNode, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={`Reorder ${label}`}
      className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
  return (
    <li ref={setNodeRef} style={style} className={cn("relative", isDragging && "z-10 opacity-80 shadow-lg")}>
      {children(handle, isDragging)}
    </li>
  );
}

/** Vertical list reordered by drag and drop (mouse, touch, keyboard) or move buttons. */
export function SortableRows({ ids, labels, onMove, renderRow, disabled, className, listLabel }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labelOf = (id: string | number) => labels[ids.indexOf(String(id))] ?? "Item";
  const positionOf = (id: string | number | undefined) => (id === undefined ? 0 : ids.indexOf(String(id)) + 1);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, position ${positionOf(active.id)} of ${ids.length} in ${listLabel}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} is over position ${positionOf(over.id)} of ${ids.length}.` : `${labelOf(active.id)} is not over a position.`),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} dropped at position ${positionOf(over.id)} of ${ids.length}.` : `${labelOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: "To reorder, press Space or Enter to pick up the item, use the arrow keys to move it, then press Space or Enter again to drop it. Press Escape to cancel." },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={cn("space-y-2", className)}>
          {ids.map((id, index) => (
            <SortableRow key={id} id={id} label={labels[index] ?? "item"} disabled={disabled}>
              {(handle) =>
                renderRow(index, {
                  handle,
                  moveButtons: (
                    <span className="flex shrink-0 gap-0.5">
                      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Move ${labels[index]} up`}>
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === ids.length - 1} onClick={() => onMove(index, index + 1)} aria-label={`Move ${labels[index]} down`}>
                        <ArrowDown aria-hidden />
                      </Button>
                    </span>
                  ),
                })
              }
            </SortableRow>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
