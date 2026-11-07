"use client";

import Link from "next/link";

import { KanbanBoard, type KanbanColumnDef } from "@/components/shared/kanban/kanban-board";
import type { ActionResult } from "@/lib/actions";

export type MobilisationCard = {
  id: string;
  columnId: string;
  code: string;
  candidateName: string;
  jobTitle: string;
  destination: string;
  travelDate: string | null;
  openRequiredItems: number;
  coordinatorName: string | null;
};

type MoveAction = (input: { mobilisationId: string; status: string }) => Promise<ActionResult<unknown>>;

/**
 * Mobilisation board by status. Moves call the recruitment module, which enforces the gates
 * (travel needs emigration clearance, visa and a fit medical; departure needs every required item
 * verified) and reports what is missing, in which case the card snaps back.
 */
export function MobilisationBoard({ columns, items, moveAction }: { columns: KanbanColumnDef[]; items: MobilisationCard[]; moveAction: MoveAction }) {
  return (
    <KanbanBoard
      label="Mobilisation board"
      columns={columns}
      items={items}
      getItemLabel={(m) => m.candidateName}
      emptyColumnText="No records"
      onMove={(move) => moveAction({ mobilisationId: move.itemId, status: move.toColumnId })}
      renderCard={(m) => (
        <div className="space-y-1">
          <Link href={`/admin/mobilisation/${m.id}`} className="font-medium underline-offset-4 hover:underline">
            {m.candidateName}
          </Link>
          <p className="text-xs text-muted-foreground">{m.jobTitle}</p>
          <p className="text-xs text-muted-foreground">
            {m.destination}
            {m.travelDate ? ` · travel ${m.travelDate}` : ""}
          </p>
          <p className="text-xs">
            {m.openRequiredItems > 0 ? (
              <span className="text-warning-strong">{m.openRequiredItems} required item{m.openRequiredItems === 1 ? "" : "s"} open</span>
            ) : (
              <span className="text-success-strong">Checklist clear</span>
            )}
          </p>
          {m.coordinatorName ? <p className="text-xs text-muted-foreground">Coordinator: {m.coordinatorName}</p> : null}
          <p className="font-mono text-[11px] text-muted-foreground">{m.code}</p>
        </div>
      )}
    />
  );
}
