import { StatusBadge } from "@/components/shared/status-badge";

const PRIORITY_TONE = { low: "neutral", normal: "info", high: "warning", urgent: "danger" } as const;
const PRIORITY_LABEL = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" } as const;

export type Priority = keyof typeof PRIORITY_TONE;

export function isPriority(v: string | null | undefined): v is Priority {
  return !!v && v in PRIORITY_TONE;
}

/** Priority label with tone (text always carries the meaning; colour is secondary). */
export function PriorityBadge({ priority, size = "sm" }: { priority: string; size?: "sm" | "md" }) {
  const p = isPriority(priority) ? priority : "normal";
  return (
    <StatusBadge tone={PRIORITY_TONE[p]} size={size}>
      {PRIORITY_LABEL[p]} priority
    </StatusBadge>
  );
}

export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as Priority[]).map((value) => ({ value, label: PRIORITY_LABEL[value] }));
