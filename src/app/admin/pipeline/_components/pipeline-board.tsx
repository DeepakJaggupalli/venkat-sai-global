"use client";

import Link from "next/link";

import { KanbanBoard, type KanbanColumnDef } from "@/components/shared/kanban/kanban-board";
import type { ActionResult } from "@/lib/actions";

export type BoardCard = {
  id: string;
  columnId: string;
  code: string;
  candidateName: string;
  jobTitle: string;
  employer: string;
  stageName: string;
  partnerName: string | null;
};

type MoveAction = (input: { applicationId: string; columnKey: string }) => Promise<ActionResult<unknown>>;

/** Cross-job pipeline board by column. Dropping moves to the column's default stage (server-checked). */
export function PipelineBoard({ columns, items, moveAction, canManage }: { columns: KanbanColumnDef[]; items: BoardCard[]; moveAction: MoveAction; canManage: boolean }) {
  return (
    <KanbanBoard
      label="Applications pipeline"
      columns={columns}
      items={items}
      getItemLabel={(c) => `${c.candidateName}, ${c.jobTitle}`}
      emptyColumnText="No applications"
      canMove={(_item, to) => canManage && to !== "closed"}
      onMove={(move) => moveAction({ applicationId: move.itemId, columnKey: move.toColumnId })}
      renderCard={(c) => (
        <div className="space-y-1">
          <Link href={`/admin/pipeline/${c.id}`} className="font-medium underline-offset-4 hover:underline">
            {c.candidateName}
          </Link>
          <p className="text-xs text-muted-foreground">{c.jobTitle}</p>
          <p className="text-xs text-muted-foreground">{c.employer}</p>
          <p className="text-xs">{c.stageName}</p>
          {c.partnerName ? <p className="text-xs text-muted-foreground">Partner: {c.partnerName}</p> : null}
          <p className="font-mono text-[11px] text-muted-foreground">{c.code}</p>
        </div>
      )}
    />
  );
}
