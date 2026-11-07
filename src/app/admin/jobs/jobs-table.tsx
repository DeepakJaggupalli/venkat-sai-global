"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import type { BulkAction } from "@/components/shared/data-table/selectable-data-table";
import { SelectableDataTable } from "@/components/shared/data-table/selectable-data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import type { ActionResult } from "@/lib/actions";

import { bulkJobDetailAction } from "./actions";

export type AdminJobRow = {
  id: string;
  code: string;
  title: string;
  employer: string;
  confidential: boolean;
  organizationName: string | null;
  location: string;
  status: string;
  displayStatus: string;
  isFeatured: boolean;
  isOverseas: boolean;
  applicationCount: number | null;
  closesAt: string | null;
  publishedAt: string | null;
};

type BulkFn = (ids: string[]) => Promise<ActionResult<unknown>>;

/**
 * Admin job list with row selection. One-click bulk actions run immediately; actions needing a reason
 * or a date open the details panel below the table (reasons are shown to employers).
 */
export function AdminJobsTable({
  rows,
  actions,
  can,
}: {
  rows: AdminJobRow[];
  actions: { approve?: BulkFn; publish?: BulkFn; unpublish?: BulkFn; resume?: BulkFn };
  can: { decide: boolean; manage: boolean; feature: boolean };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const refreshAfter =
    (fn: BulkFn): BulkAction["onAction"] =>
    async (ids) => {
      const r = await fn(ids);
      router.refresh();
      return r;
    };

  const bulk: BulkAction[] = [];
  if (actions.approve) bulk.push({ id: "approve", label: "Approve", onAction: refreshAfter(actions.approve), confirm: { title: "Approve the selected jobs?", description: "Jobs waiting for approval are published and employers are notified.", confirmLabel: "Approve" } });
  if (actions.publish) bulk.push({ id: "publish", label: "Publish", variant: "outline", onAction: refreshAfter(actions.publish), confirm: { title: "Publish the selected jobs?", description: "Only jobs from verified employers can be published.", confirmLabel: "Publish" } });
  if (actions.unpublish) bulk.push({ id: "unpublish", label: "Unpublish", variant: "outline", onAction: refreshAfter(actions.unpublish), confirm: { title: "Unpublish the selected jobs?", description: "Live jobs are paused and hidden from candidates until resumed.", confirmLabel: "Unpublish" } });
  if (actions.resume) bulk.push({ id: "resume", label: "Resume", variant: "outline", onAction: refreshAfter(actions.resume) });

  const detailOptions = [
    ...(can.decide ? [{ value: "reject", label: "Reject" }, { value: "changes", label: "Request changes" }] : []),
    ...(can.manage ? [{ value: "close", label: "Close" }, { value: "extend", label: "Extend deadline and listing" }] : []),
    ...(can.feature ? [{ value: "feature", label: "Feature until a date" }] : []),
  ];

  return (
    <div className="space-y-4">
      <SelectableDataTable
        caption="Jobs"
        rows={rows}
        getRowId={(r) => r.id}
        selectLabel={(r) => `Select ${r.title} (${r.code})`}
        onSelectionChange={setSelected}
        bulkActions={bulk}
        rowLink={(r) => ({ href: `/admin/jobs/${r.id}`, label: `Open ${r.code}: ${r.title}` })}
        columns={[
          {
            id: "title",
            header: "Job",
            primary: true,
            cell: (r) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {r.title}
                  {r.isFeatured ? (
                    <StatusBadge tone="gold" size="sm" className="ml-2 align-middle">
                      Featured
                    </StatusBadge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.code} · {r.confidential ? `${r.employer} (confidential${r.organizationName ? `: ${r.organizationName}` : ""})` : r.employer}
                  {r.location ? ` · ${r.location}` : ""}
                  {r.isOverseas ? " · Overseas" : ""}
                </p>
              </div>
            ),
          },
          { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.displayStatus} domain="job" size="sm" /> },
          { id: "apps", header: "Applications", align: "right", hideOnMobile: true, cell: (r) => r.applicationCount ?? 0 },
          { id: "closes", header: "Closes", hideOnMobile: true, cell: (r) => (r.closesAt ? <DateText value={r.closesAt} /> : <span className="text-muted-foreground">—</span>) },
        ]}
        empty={<EmptyState title="No jobs match" description="Try clearing a filter, or create a job for a client." primaryAction={{ label: "Clear filters", href: "/admin/jobs", variant: "outline" }} />}
      />
      {selected.length > 0 && detailOptions.length ? (
        <section aria-labelledby="bulk-details-title" className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <h2 id="bulk-details-title" className="font-heading text-sm font-semibold">
            More actions for {selected.length} selected {selected.length === 1 ? "job" : "jobs"}
          </h2>
          <ActionForm
            key={selected.join(",")}
            className="mt-3"
            action={bulkJobDetailAction}
            hidden={{ ids: selected.join(",") }}
            columns={2}
            fields={[
              { name: "operation", label: "Action", kind: "select", required: true, options: detailOptions },
              { name: "reason", label: "Reason (reject or request changes)", kind: "textarea", optional: true, rows: 2, hint: "The employer sees this reason" },
              {
                name: "closeReason",
                label: "Closing reason",
                kind: "select",
                optional: true,
                options: [
                  { value: "filled", label: "Filled" },
                  { value: "cancelled", label: "Cancelled" },
                  { value: "duplicate", label: "Duplicate" },
                  { value: "other", label: "Other" },
                ],
              },
              { name: "date", label: "New date (extend or feature until)", kind: "date", optional: true },
              {
                name: "promotionType",
                label: "Promotion",
                kind: "select",
                optional: true,
                defaultValue: "featured",
                options: [
                  { value: "featured", label: "Featured" },
                  { value: "boosted", label: "Boosted" },
                  { value: "homepage", label: "Homepage" },
                ],
              },
            ]}
            submitLabel="Apply to selected"
            pendingLabel="Applying…"
          />
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Need a job for a client who should stay anonymous? <Link className="underline underline-offset-4" href="/admin/jobs/new">Create a confidential job</Link>.
      </p>
    </div>
  );
}
