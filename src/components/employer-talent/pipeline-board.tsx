"use client";

import { Flag, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { KanbanBoard, type KanbanColumnDef } from "@/components/shared/kanban/kanban-board";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import type { ActionResult } from "@/lib/actions";
import { transitionApplicationAction } from "@/modules/recruitment/actions";
import { canTransition, dropTargetStage, type PipelineColumnKey } from "@/modules/recruitment/workflow";

import { formatExperience } from "./labels";
import { RejectDialog } from "./reject-dialog";

export type BoardStage = { id: string; key: string; name: string; category: string; isTerminal: boolean; isActive: boolean; sortOrder: number };

export type BoardCard = {
  id: string;
  columnId: string;
  code: string;
  displayName: string;
  headline: string | null;
  city: string | null;
  countryCode: string | null;
  totalExperienceMonths: number | null;
  skills: string[];
  stageId: string;
  stageName: string;
  rating: number | null;
  isShortlisted: boolean;
  knockoutFlagCount: number;
  source: string;
  lastStageChangedAt: Date;
};

type PendingReject = { applicationId: string; name: string; stageKey: string; resolve: (r: ActionResult<unknown>) => void };

/**
 * Employer Kanban for one job. Drag and drop or each card's "Move to" menu; the server enforces the
 * transition rules (canTransition is only a hint here). Moving into "Closed" asks for a structured
 * rejection reason and a candidate-safe message first.
 */
export function PipelineBoard({ columns, cards, stages, canManage }: { columns: KanbanColumnDef[]; cards: BoardCard[]; stages: BoardStage[]; canManage: boolean }) {
  const pathname = usePathname();
  const [reject, setReject] = useState<PendingReject | null>(null);

  const stageById = useCallback((id: string) => stages.find((s) => s.id === id), [stages]);
  const target = useCallback((columnId: string) => dropTargetStage(stages as Parameters<typeof dropTargetStage>[0], columnId as PipelineColumnKey) as BoardStage | undefined, [stages]);

  const canMove = (card: BoardCard, toColumnId: string) => {
    if (!canManage) return false;
    const from = stageById(card.stageId);
    const to = target(toColumnId);
    if (!from || !to) return false;
    return canTransition("employer", from as Parameters<typeof canTransition>[1], to as Parameters<typeof canTransition>[2]).allowed;
  };

  const onMove = async (move: { itemId: string; toColumnId: string }, card: BoardCard): Promise<ActionResult<unknown>> => {
    const to = target(move.toColumnId);
    if (!to) return { ok: false, error: "This column has no stage in the job's workflow." };
    if (to.category === "rejected") {
      return new Promise<ActionResult<unknown>>((resolve) => setReject({ applicationId: card.id, name: card.displayName, stageKey: to.key, resolve }));
    }
    return transitionApplicationAction({ portal: "employer", applicationId: card.id, toStageKey: to.key });
  };

  return (
    <>
      <KanbanBoard<BoardCard>
        label="Hiring pipeline"
        columns={columns}
        items={cards}
        getItemLabel={(c) => c.displayName}
        canMove={canMove}
        onMove={onMove}
        emptyColumnText="No candidates"
        renderCard={(c) => (
          <div className="space-y-1.5" data-testid="pipeline-card">
            <Link href={`${pathname}?application=${c.id}`} scroll={false} className="block font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline">
              {c.displayName}
              <span className="sr-only">, open application</span>
            </Link>
            {c.headline ? <p className="line-clamp-2 text-xs text-muted-foreground">{c.headline}</p> : null}
            <p className="text-xs text-muted-foreground">
              {[c.city, c.countryCode].filter(Boolean).join(", ") || "Location not shared"} · {formatExperience(c.totalExperienceMonths)}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="neutral" size="sm">
                {c.stageName}
              </StatusBadge>
              {c.isShortlisted ? (
                <StatusBadge tone="gold" size="sm">
                  Shortlisted
                </StatusBadge>
              ) : null}
              {c.knockoutFlagCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-warning-strong">
                  <Flag aria-hidden className="size-3.5" />
                  {c.knockoutFlagCount} {c.knockoutFlagCount === 1 ? "answer flagged" : "answers flagged"}
                </span>
              ) : null}
              {c.rating ? (
                <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star aria-hidden className="size-3.5 fill-gold text-gold" />
                  {c.rating}/5<span className="sr-only"> rating</span>
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {c.source === "direct" ? "Applied directly" : "Via Venkat Sai"} · moved <RelativeTime value={c.lastStageChangedAt} />
            </p>
          </div>
        )}
      />
      {reject ? (
        <RejectDialog
          open
          onOpenChange={(open) => {
            if (!open) setReject(null);
          }}
          applicationId={reject.applicationId}
          candidateName={reject.name}
          rejectStageKey={reject.stageKey}
          onDone={(result) => {
            reject.resolve(result);
            setReject(null);
          }}
        />
      ) : null}
    </>
  );
}
