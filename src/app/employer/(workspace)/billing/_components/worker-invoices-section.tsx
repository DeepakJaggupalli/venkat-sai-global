import { Download } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { MoneyText } from "@/components/shared/money-text";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { listOrgWorkerInvoices } from "@/modules/commercial/worker-invoices";
import type { OrgContext } from "@/modules/identity/authz";
import { EMPLOYER_PORTAL_BASE, employerKindOf, portalForEmployerKind } from "@/modules/organizations/employer-kind";

/**
 * Company / Travel Agency portal: invoices for the workers Venkat Sai supplied (one line per worker), with a PDF
 * download per invoice. Issued invoices only; nothing is shown when there are none. `limit` + `compact` give the
 * short version for the billing overview with a link to the full list.
 */
export async function WorkerInvoicesSection({ ctx, limit = 25, compact = false }: { ctx: OrgContext; limit?: number; compact?: boolean }) {
  const result = await listOrgWorkerInvoices(ctx, { page: 1, pageSize: limit, offset: 0 });
  if (!result.items.length) return null;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const base = `${EMPLOYER_PORTAL_BASE[portalForEmployerKind(employerKindOf(ctx.organization) ?? "direct_company")]}/billing`;
  const more = result.total > result.items.length;

  return (
    <SectionCard
      id="worker-invoices"
      title="Invoices for workers we supplied"
      description="One line per worker. Download the PDF for your records, or open it to print or pay."
      action={compact && more ? { label: "See all", href: `${base}/invoices#worker-invoices`, variant: "outline" } : undefined}
      flush
    >
      <DataTable
        caption="Invoices for workers we supplied"
        rows={result.items}
        getRowId={(r) => r.id}
        rowLink={(r) => ({ href: `/billing/invoices/${r.id}`, label: `Open invoice ${r.code ?? ""}` })}
        columns={[
          {
            id: "invoice",
            header: "Invoice",
            primary: true,
            cell: (r) => (
              <span>
                <span className="block font-medium tabular-nums">{r.code ?? "Invoice"}</span>
                {r.issuedAt ? (
                  <span className="block text-xs text-muted-foreground">
                    <DateText value={r.issuedAt} timeZone={timeZone} />
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: "workers",
            header: "Workers",
            cell: (r) => (
              <span className="block max-w-md break-words">
                {r.workers.map((w) => (w.tradeLabel ? `${w.name} (${w.tradeLabel})` : w.name)).join(", ")}
              </span>
            ),
          },
          {
            id: "total",
            header: "Total",
            align: "right",
            nowrap: true,
            cell: (r) => (
              <span>
                <MoneyText amountMinor={r.totalMinor} currency={r.currency} />
                {r.outstandingMinor > 0 ? (
                  <span className="block text-xs text-muted-foreground">
                    <MoneyText amountMinor={r.outstandingMinor} currency={r.currency} /> due
                  </span>
                ) : null}
              </span>
            ),
          },
          { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} domain="invoice" size="sm" /> },
          {
            id: "pdf",
            header: <span className="sr-only">Download</span>,
            align: "right",
            cell: (r) => (
              <Button asChild variant="outline" className="h-11 rounded-full px-5">
                <a href={`${base}/invoices/${r.id}/pdf`} download>
                  <Download aria-hidden="true" />
                  PDF
                  <span className="sr-only"> of invoice {r.code ?? ""}</span>
                </a>
              </Button>
            ),
          },
        ]}
        footer={
          !compact && more ? (
            <p className="text-sm text-muted-foreground">
              Showing the latest {result.items.length} of {result.total}. Every invoice is also in the list below.
            </p>
          ) : undefined
        }
      />
    </SectionCard>
  );
}
