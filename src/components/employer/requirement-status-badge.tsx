import { StatusBadge } from "@/components/shared/status-badge";
import { REQUIREMENT_STATUS_LABELS } from "@/modules/operations/constants";

const STATUS_TONES: Record<string, "neutral" | "info" | "success" | "warning" | "danger" | "brand"> = {
  draft: "neutral",
  submitted: "info",
  under_review: "info",
  approved: "success",
  sourcing: "brand",
  in_progress: "brand",
  partially_filled: "brand",
  filled: "success",
  on_hold: "warning",
  cancelled: "neutral",
  closed: "neutral",
};

/** Workforce requirement status with its employer-facing label (text, never colour alone). */
export function RequirementStatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  return (
    <StatusBadge tone={STATUS_TONES[status] ?? "neutral"} size={size}>
      {REQUIREMENT_STATUS_LABELS[status as keyof typeof REQUIREMENT_STATUS_LABELS] ?? status}
    </StatusBadge>
  );
}
