import { StatusBadge } from "@/components/shared/status-badge";
import { DATA_REQUEST_STATUS_LABELS, dataRequestSlaState, type DataRequestStatus } from "@/modules/privacy/constants";

const STATUS_TONE: Record<DataRequestStatus, "neutral" | "info" | "success" | "warning" | "danger" | "brand"> = {
  received: "info",
  identity_verification: "warning",
  in_progress: "brand",
  completed: "success",
  rejected: "neutral",
  cancelled: "neutral",
};

export function DataRequestStatusBadge({ status, labels }: { status: DataRequestStatus; labels?: Partial<Record<DataRequestStatus, string>> }) {
  return (
    <StatusBadge tone={STATUS_TONE[status]} size="sm">
      {labels?.[status] ?? DATA_REQUEST_STATUS_LABELS[status]}
    </StatusBadge>
  );
}

export function DataRequestSlaBadge({ status, dueAt }: { status: DataRequestStatus; dueAt: Date | null }) {
  const state = dataRequestSlaState({ status, dueAt });
  if (state === "closed" || state === "none") return <span className="text-xs text-muted-foreground">—</span>;
  const preset = { overdue: { tone: "danger" as const, label: "Overdue" }, due_soon: { tone: "warning" as const, label: "Due soon" }, on_track: { tone: "info" as const, label: "On track" } }[state];
  return (
    <StatusBadge tone={preset.tone} size="sm">
      {preset.label}
    </StatusBadge>
  );
}
