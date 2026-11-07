"use client";

import { X } from "lucide-react";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { ConfirmDialog } from "../confirm-dialog";
import { GENERIC_ERROR, interpretOutcome, isNavigationError } from "../form/action-result";
import { TONE_STYLES } from "../tones";
import { DataTable, type DataTableProps } from "./data-table";
import { selectionState, toggleAll, toggleOne } from "./selection";

export type BulkAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "destructive";
  /** Receives the selected row ids. May be a Server Action. Return an ActionResult (or false) to report failure. */
  onAction: (ids: string[]) => unknown | Promise<unknown>;
  /** Ask for confirmation first (recommended for anything destructive or that notifies people). */
  confirm?: { title: string; description?: string; confirmLabel?: string };
  /** Toast when the result carries no message. */
  successMessage?: string;
};

type SelectableDataTableProps<T> = Omit<DataTableProps<T>, "leading" | "isRowSelected" | "toolbar"> & {
  bulkActions: BulkAction[];
  /** Accessible name for each row checkbox, e.g. (row) => `Select ${row.name}`. */
  selectLabel: (row: T) => string;
  isRowSelectable?: (row: T) => boolean;
  onSelectionChange?: (ids: string[]) => void;
  labels?: { selected?: (count: number) => string; clear?: string; selectAll?: string };
};

/**
 * Client table with row selection and a bulk action bar. Column definitions contain functions, so
 * declare them in a client component (e.g. components/admin/candidates-table.tsx) and pass rows in.
 * Selection is per page and resets to the visible rows when the page changes.
 */
export function SelectableDataTable<T>({
  bulkActions,
  selectLabel,
  isRowSelectable,
  onSelectionChange,
  labels,
  rows,
  getRowId,
  ...tableProps
}: SelectableDataTableProps<T>) {
  const [selected, setSelected] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const selectableIds = useMemo(
    () => rows.filter((r) => (isRowSelectable ? isRowSelectable(r) : true)).map(getRowId),
    [rows, getRowId, isRowSelectable],
  );
  // Only ids still on screen count (rows change after paging, filtering or a mutation).
  const effective = useMemo(() => selected.filter((id) => selectableIds.includes(id)), [selected, selectableIds]);
  const state = selectionState(selectableIds, effective);

  const update = (next: string[]) => {
    setSelected(next);
    onSelectionChange?.(next);
  };

  const run = (action: BulkAction) => {
    const ids = effective;
    setRunningId(action.id);
    startTransition(async () => {
      try {
        const outcome = interpretOutcome(await action.onAction(ids));
        if (!outcome.ok) {
          toast.error(outcome.error);
          return;
        }
        const message = outcome.message ?? action.successMessage;
        if (message) toast.success(message);
        update([]);
      } catch (err) {
        if (isNavigationError(err)) throw err;
        toast.error(GENERIC_ERROR);
      } finally {
        setRunningId(null);
      }
    });
  };

  const selectedText = labels?.selected?.(effective.length) ?? `${effective.length} selected`;

  const toolbar =
    effective.length > 0 ? (
      <div
        role="region"
        aria-label="Bulk actions"
        className="flex flex-wrap items-center gap-2 border-b border-border bg-teal-soft/60 px-4 py-2.5"
      >
        <p aria-live="polite" className="mr-auto text-sm font-medium text-foreground">
          {selectedText}
        </p>
        {bulkActions.map((action) => {
          const busy = runningId === action.id;
          const button = (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant={action.variant === "destructive" ? "outline" : (action.variant ?? "outline")}
              disabled={runningId !== null}
              className={cn(action.variant === "destructive" && cn("border-danger/30 hover:bg-danger-soft", TONE_STYLES.danger.text))}
              onClick={action.confirm ? undefined : () => run(action)}
            >
              {busy ? <Spinner aria-hidden="true" role="presentation" /> : action.icon}
              {action.label}
            </Button>
          );
          return action.confirm ? (
            <ConfirmDialog
              key={action.id}
              trigger={button}
              title={action.confirm.title}
              description={action.confirm.description}
              confirmLabel={action.confirm.confirmLabel ?? action.label}
              variant={action.variant === "destructive" ? "destructive" : "default"}
              successMessage={action.successMessage ?? false}
              onConfirm={() => action.onAction(effective)}
              onSuccess={() => update([])}
            />
          ) : (
            button
          );
        })}
        <Button type="button" size="sm" variant="ghost" onClick={() => update([])}>
          <X aria-hidden="true" />
          {labels?.clear ?? "Clear selection"}
        </Button>
      </div>
    ) : null;

  return (
    <DataTable
      {...tableProps}
      rows={rows}
      getRowId={getRowId}
      toolbar={toolbar}
      isRowSelected={(row) => effective.includes(getRowId(row))}
      leading={{
        header: (
          <Checkbox
            aria-label={labels?.selectAll ?? "Select all rows on this page"}
            checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
            disabled={selectableIds.length === 0}
            onCheckedChange={() => update(toggleAll(selectableIds, effective))}
          />
        ),
        cell: (row) => {
          const id = getRowId(row);
          const selectable = selectableIds.includes(id);
          return (
            <Checkbox
              aria-label={selectLabel(row)}
              checked={effective.includes(id)}
              disabled={!selectable}
              onCheckedChange={() => update(toggleOne(effective, id))}
            />
          );
        },
      }}
    />
  );
}
