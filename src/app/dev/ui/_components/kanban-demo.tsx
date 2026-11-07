"use client";

import { useId, useState } from "react";

import { KanbanBoard, type KanbanColumnDef } from "@/components/shared/kanban/kanban-board";
import { StatusBadge } from "@/components/shared/status-badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type SampleCard = { id: string; columnId: string; name: string; trade: string };

const COLUMNS: KanbanColumnDef[] = [
  { id: "applied", title: "Applied", tone: "info" },
  { id: "screening", title: "Screening", tone: "info" },
  { id: "interview", title: "Interview", tone: "brand", description: "Sample: trade test or video call" },
  { id: "offer", title: "Offer", tone: "gold" },
];

const ITEMS: SampleCard[] = [
  { id: "k1", columnId: "applied", name: "Sample Candidate A", trade: "Sample trade: GTAW" },
  { id: "k2", columnId: "applied", name: "Sample Candidate B", trade: "Sample trade: SMAW" },
  { id: "k3", columnId: "screening", name: "Sample Candidate C", trade: "Sample trade: Pipe fitter" },
  { id: "k4", columnId: "interview", name: "Sample Candidate D", trade: "Sample trade: FCAW" },
];

export function KanbanDemo() {
  const [fail, setFail] = useState(false);
  const switchId = useId();
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Switch id={switchId} checked={fail} onCheckedChange={setFail} />
        <Label htmlFor={switchId}>Simulate a server error (shows rollback)</Label>
      </div>
      <KanbanBoard
        label="Sample applicants pipeline"
        columns={COLUMNS}
        items={ITEMS}
        getItemLabel={(c) => c.name}
        canMove={(_item, to) => to !== "offer" || !fail}
        successMessage="Demo: card moved (nothing saved)"
        onMove={async () => {
          await new Promise((r) => setTimeout(r, 600));
          return fail ? { ok: false, error: "Demo: the move was rejected, so the card went back." } : { ok: true };
        }}
        renderCard={(c) => (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.trade}</p>
            <StatusBadge tone="neutral" size="sm" dot={false}>
              Sample
            </StatusBadge>
          </div>
        )}
      />
    </div>
  );
}
