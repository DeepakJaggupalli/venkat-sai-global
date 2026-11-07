import { StatusBadge } from "@/components/shared/status-badge";

import { billingStatus, type BillingStatusKind } from "./labels";

/** Status badge for subscriptions, refunds, disputes and settlements (invoices/payments use StatusBadge presets). */
export function BillingStatusBadge({ kind, status, size = "sm" }: { kind: BillingStatusKind; status: string; size?: "sm" | "md" }) {
  const { tone, label } = billingStatus(kind, status);
  return (
    <StatusBadge tone={tone} size={size} status={status}>
      {label}
    </StatusBadge>
  );
}
