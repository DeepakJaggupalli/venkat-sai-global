import { StatusBadge } from "@/components/shared/status-badge";
import type { DeadlineState } from "@/modules/operations/sla";

const PRESET: Record<DeadlineState, { tone: "neutral" | "success" | "info" | "warning" | "danger"; label: string } | null> = {
  none: null,
  met: { tone: "success", label: "Met" },
  pending: { tone: "info", label: "On track" },
  due_soon: { tone: "warning", label: "Due soon" },
  breached: { tone: "danger", label: "Missed" },
};

/** Deadline state as text + tone (never colour alone). */
export function SlaBadge({ state, prefix }: { state: DeadlineState; prefix?: string }) {
  const p = PRESET[state];
  if (!p) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <StatusBadge tone={p.tone} size="sm">
      {prefix ? `${prefix}: ${p.label}` : p.label}
    </StatusBadge>
  );
}
