import { StatusBadge } from "@/components/shared/status-badge";

import { VERIFICATION_LEVEL_LABELS } from "./labels";

const TONE: Record<string, "neutral" | "info" | "success"> = { none: "neutral", basic: "info", documents_verified: "success", skills_assessed: "success" };

/** Venkat Sai profile verification level (never shown as verified unless Venkat Sai verified it). */
export function VerificationLevelBadge({ level, size = "sm" }: { level: string; size?: "sm" | "md" }) {
  return (
    <StatusBadge tone={TONE[level] ?? "neutral"} size={size} srPrefix="Verification:">
      {VERIFICATION_LEVEL_LABELS[level] ?? "Not yet verified"}
    </StatusBadge>
  );
}
