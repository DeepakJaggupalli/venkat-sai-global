"use client";

import { CheckCircle2, Trash2 } from "lucide-react";

import type { DataTableColumn } from "@/components/shared/data-table/types";
import { SelectableDataTable } from "@/components/shared/data-table/selectable-data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/avatars";

type SampleApplicant = { id: string; name: string; trade: string; status: string; applied: string };

const ROWS: SampleApplicant[] = [
  { id: "s1", name: "Sample Candidate A", trade: "Sample trade: GTAW", status: "active", applied: "Sample date" },
  { id: "s2", name: "Sample Candidate B", trade: "Sample trade: SMAW", status: "active", applied: "Sample date" },
  { id: "s3", name: "Sample Candidate C", trade: "Sample trade: Pipe fitter", status: "hired", applied: "Sample date" },
  { id: "s4", name: "Sample Candidate D", trade: "Sample trade: FCAW", status: "withdrawn", applied: "Sample date" },
];

const COLUMNS: DataTableColumn<SampleApplicant>[] = [
  {
    id: "name",
    header: "Candidate",
    primary: true,
    cell: (r) => (
      <span className="flex items-center gap-2">
        <UserAvatar name={r.name} size="sm" />
        <span className="font-medium">{r.name}</span>
      </span>
    ),
  },
  { id: "trade", header: "Trade", cell: (r) => r.trade },
  { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} domain="application" size="sm" /> },
  { id: "applied", header: "Applied", cell: (r) => r.applied, hideOnMobile: true },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SelectableTableDemo() {
  return (
    <SelectableDataTable
      caption="Sample applicants (selectable)"
      rows={ROWS}
      columns={COLUMNS}
      getRowId={(r) => r.id}
      selectLabel={(r) => `Select ${r.name}`}
      isRowSelectable={(r) => r.status === "active"}
      bulkActions={[
        {
          id: "shortlist",
          label: "Shortlist",
          icon: <CheckCircle2 aria-hidden="true" />,
          onAction: async (ids) => {
            await wait(700);
            return { ok: true, message: `Demo: ${ids.length} sample candidate(s) shortlisted` };
          },
        },
        {
          id: "reject",
          label: "Reject",
          variant: "destructive",
          icon: <Trash2 aria-hidden="true" />,
          confirm: { title: "Reject the selected sample candidates?", description: "Demo only — nothing is changed." },
          onAction: async (ids) => {
            await wait(700);
            return { ok: true, message: `Demo: ${ids.length} sample candidate(s) rejected` };
          },
        },
      ]}
    />
  );
}
