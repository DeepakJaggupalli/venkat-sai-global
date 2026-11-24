import { Download, Receipt } from "lucide-react";
import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { parsePage, type SearchParams } from "@/lib/http";
import { listWorkerInvoices, WORKER_INVOICES_ADMIN_PATH } from "@/modules/commercial/worker-invoices";
import type { WorkerInvoiceListItem } from "@/modules/commercial/worker-invoices-rules";
import { workerInvoiceListFiltersSchema } from "@/modules/commercial/worker-invoices-schemas";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { COMMERCIAL_CRUMB } from "../_lib/nav";

export const metadata: Metadata = { title: "Worker invoices" };

const STATUS_OPTIONS = [
  { value: "draft", label: "Drafts" },
  { value: "open", label: "Waiting for payment" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function workerNames(row: WorkerInvoiceListItem): string {
  const names = row.workers.map((w) => w.name);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/**
 * /admin/commercial/worker-invoices — invoices to travel agencies and companies with one line per worker supplied
 * (commercial.view; creating needs commercial.invoices). Opening a row shows the invoice, its PDF and WhatsApp.
 */
export default async function WorkerInvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const filters = workerInvoiceListFiltersSchema.parse({ q: str(sp.q), status: str(sp.status), organizationId: str(sp.org) });
  const page = parsePage(sp, { defaultSize: 25 });
  const result = await listWorkerInvoices(staff, filters, page);
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canCreate = staffCan(staff, "commercial.invoices");
  const filtered = Boolean(filters.q || filters.status || filters.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Worker invoices"
        description="Bill travel agencies and companies for the workers we supplied: one line per worker. Workers are never charged."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Worker invoices" }]}
        actions={canCreate ? [{ label: "New worker invoice", href: `${WORKER_INVOICES_ADMIN_PATH}/new` }] : []}
      />
      <SectionCard title="All worker invoices" flush>
        <FilterScope>
          <div className="p-4 sm:p-5">
            <FilterBar paramKeys={["q", "status", "org"]} search={<SearchInput label="Search invoice number, organisation or worker" />}>
              <FilterSelect param="status" label="Status" allLabel="All statuses" options={STATUS_OPTIONS} />
            </FilterBar>
            {filters.organizationId ? <p className="mt-3 text-sm text-muted-foreground">Showing one organisation. Reset filters to see all.</p> : null}
          </div>
          <FilterPendingRegion>
            <DataTable
              caption="Worker invoices"
              rows={result.items}
              getRowId={(r) => r.id}
              rowLink={(r) => ({ href: `${WORKER_INVOICES_ADMIN_PATH}/${r.id}`, label: `Open ${r.code ?? "draft invoice"} for ${r.organizationName ?? "organisation"}` })}
              columns={[
                {
                  id: "number",
                  header: "Invoice",
                  primary: true,
                  cell: (r) => (
                    <span className="min-w-0">
                      <span className="block font-medium tabular-nums">{r.code ?? "Draft"}</span>
                      <span className="block text-sm break-words text-muted-foreground">{r.organizationName ?? "—"}</span>
                    </span>
                  ),
                },
                {
                  id: "workers",
                  header: "Workers",
                  cell: (r) => (
                    <span className="block max-w-sm break-words">
                      <span className="font-medium">{r.workers.length}</span>
                      <span className="text-muted-foreground"> · {workerNames(r)}</span>
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
                { id: "date", header: "Date", nowrap: true, cell: (r) => <DateText value={r.issuedAt ?? r.createdAt} timeZone={timeZone} /> },
                {
                  id: "pdf",
                  header: <span className="sr-only">PDF</span>,
                  align: "right",
                  cell: (r) => (
                    <Button asChild variant="outline" size="sm" className="h-11 rounded-full px-4">
                      <a href={`${WORKER_INVOICES_ADMIN_PATH}/${r.id}/pdf`} download>
                        <Download aria-hidden="true" />
                        PDF
                        <span className="sr-only"> of {r.code ?? "draft invoice"}</span>
                      </a>
                    </Button>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  icon={<Receipt />}
                  title={filtered ? "No worker invoices match" : "No worker invoices yet"}
                  description={filtered ? "Try other filters." : "When workers you supplied are selected, bill the travel agency or company here."}
                  primaryAction={canCreate && !filtered ? { label: "New worker invoice", href: `${WORKER_INVOICES_ADMIN_PATH}/new` } : undefined}
                  size="sm"
                  variant="plain"
                />
              }
              footer={<Pagination pathname={WORKER_INVOICES_ADMIN_PATH} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="invoices" />}
            />
          </FilterPendingRegion>
        </FilterScope>
      </SectionCard>
    </div>
  );
}
