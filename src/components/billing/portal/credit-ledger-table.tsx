import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { ENTITLEMENTS } from "@/modules/commercial/constants";
import type { CreditLedgerItem } from "@/modules/commercial/types";

const REASON_LABELS: Record<CreditLedgerItem["reason"], string> = {
  plan_grant: "Plan allowance",
  purchase: "Purchased",
  consumption: "Used",
  expiry: "Expired",
  adjustment: "Adjustment",
  refund: "Refund",
};

/** Credit ledger entries (portal and Command Centre). `showNotes` is for staff only. */
export function CreditLedgerTable({ rows, timeZone, showNotes = false }: { rows: CreditLedgerItem[]; timeZone?: string; showNotes?: boolean }) {
  return (
    <DataTable
      caption="Credit history"
      rows={rows}
      getRowId={(r) => r.id}
      columns={[
        { id: "date", header: "Date", primary: true, cell: (r) => <DateText value={r.createdAt} mode="datetime" timeZone={timeZone} /> },
        { id: "credit", header: "Credit", cell: (r) => ENTITLEMENTS[r.entitlementKey]?.label ?? r.entitlementKey },
        { id: "reason", header: "Entry", cell: (r) => REASON_LABELS[r.reason] ?? r.reason },
        { id: "delta", header: "Change", align: "right", nowrap: true, cell: (r) => <span className="tabular-nums">{r.delta > 0 ? `+${r.delta}` : r.delta}</span> },
        { id: "balance", header: "Balance", align: "right", cell: (r) => <span className="tabular-nums">{r.balanceAfter}</span> },
        { id: "expires", header: "Expires", hideOnMobile: true, cell: (r) => (r.expiresAt ? <DateText value={r.expiresAt} timeZone={timeZone} /> : "—") },
        ...(showNotes ? [{ id: "note", header: "Note", cell: (r: CreditLedgerItem) => r.note ?? "—" }] : []),
      ]}
      empty={<EmptyState title="No credit activity yet" description="Allowances, purchases and usage appear here." size="sm" variant="plain" />}
    />
  );
}
