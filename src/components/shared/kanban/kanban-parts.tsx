"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightLeft, GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { TONE_STYLES, type Tone } from "../tones";

export type KanbanColumnDef = {
  id: string;
  title: string;
  description?: string;
  /** Marker colour for the column header (the title always names the column). */
  tone?: Tone;
};

export const COLUMN_PREFIX = "column:";

type ColumnProps = {
  column: KanbanColumnDef;
  itemIds: string[];
  count: number;
  emptyText: string;
  children: ReactNode;
};

export function KanbanColumnView({ column, itemIds, count, emptyText, children }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${column.id}` });
  const headingId = `kanban-col-${column.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex w-[17.5rem] shrink-0 snap-start flex-col rounded-xl border border-border bg-surface-subtle sm:w-72"
    >
      <header className="flex items-start gap-2 px-3 pt-3 pb-2">
        <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_STYLES[column.tone ?? "neutral"].dot)} />
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="truncate">{column.title}</span>
            <span className="rounded-full bg-card px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums ring-1 ring-border">
              {count}
              <span className="sr-only"> {count === 1 ? "item" : "items"}</span>
            </span>
          </h3>
          {column.description ? <p className="mt-0.5 text-xs text-muted-foreground">{column.description}</p> : null}
        </div>
      </header>
      <SortableContext id={column.id} items={itemIds} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 rounded-b-xl px-2 pb-2 transition-colors",
            isOver && "bg-teal-soft/60 ring-2 ring-teal/30 ring-inset",
          )}
        >
          {children}
          {count === 0 ? (
            <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {emptyText}
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </section>
  );
}

type CardProps = {
  id: string;
  label: string;
  columnId: string;
  columns: KanbanColumnDef[];
  pending: boolean;
  canMoveTo: (columnId: string) => boolean;
  onMoveTo: (columnId: string) => void;
  children: ReactNode;
};

export function KanbanCardView({ id, label, columnId, columns, pending, canMoveTo, onMoveTo, children }: CardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { columnId },
    disabled: pending,
  });
  const targets = columns.filter((c) => c.id !== columnId);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-busy={pending || undefined}
      className={cn(
        "group/card relative rounded-lg border border-border bg-card shadow-xs transition-shadow",
        isDragging && "opacity-40",
        pending && "opacity-70",
      )}
    >
      <div className="flex items-start gap-1 p-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Move ${label} (drag handle)`}
          className="mt-0.5 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed"
        >
          {pending ? <Spinner aria-hidden="true" role="presentation" className="size-3.5" /> : <GripVertical aria-hidden="true" className="size-4" />}
        </button>
        <div className="min-w-0 flex-1 py-0.5">{children}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label={`Move ${label} to another column`}>
              <ArrowRightLeft aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {targets.map((column) => (
              <DropdownMenuItem key={column.id} disabled={!canMoveTo(column.id)} onSelect={() => onMoveTo(column.id)}>
                <span aria-hidden="true" className={cn("size-2 rounded-full", TONE_STYLES[column.tone ?? "neutral"].dot)} />
                {column.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
