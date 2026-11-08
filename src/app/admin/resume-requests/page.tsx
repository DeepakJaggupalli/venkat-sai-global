import { FileDown, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { DownloadExcelButton } from "@/components/admin/download-excel-button";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { fromMinorUnits } from "@/lib/format";
import { parsePage, sp as pick, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { resumePriceLabel } from "@/modules/resume-service/price";
import { RESUME_REQUEST_STATUSES, RESUME_REQUEST_STATUS_LABELS, RESUME_REQUEST_STATUS_TONE, resumeRequestFiltersSchema } from "@/modules/resume-service/schemas";
import { getResumeServicePrice, listResumeRequests, resumeRequestCounts } from "@/modules/resume-service/service";
import { getSetting, isFeatureEnabled } from "@/modules/settings";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { saveResumePriceAction } from "./actions";

export const metadata: Metadata = { title: "Resume requests" };

/** Route handler download (a plain link: not a page). */
const templateHref = (format: "docx" | "pdf") => `/admin/resume-requests/template?format=${format}`;

const statusOptions = RESUME_REQUEST_STATUSES.map((value) => ({ value, label: RESUME_REQUEST_STATUS_LABELS[value] }));

/** "Prepare my resume" requests (candidates.manage): payment follow-up, generation and delivery; price; blank templates. */
export default async function ResumeRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("candidates.manage");
  const sp = await searchParams;
  const filters = resumeRequestFiltersSchema.parse({ status: pick(sp, "status"), q: pick(sp, "q") });
  const page = parsePage(sp, { defaultSize: 25 });
  const canEditPrice = staffCan(ctx, "settings.manage");
  const [result, counts, price, enabled, currencies, defaultCurrency] = await Promise.all([
    listResumeRequests(ctx, filters, page),
    resumeRequestCounts(ctx),
    getResumeServicePrice(),
    isFeatureEnabled("services.resume_writing"),
    canEditPrice ? currencyOptions() : Promise.resolve([]),
    getSetting("commercial.default_currency"),
  ]);
  const priceCurrency = price.currency || String(defaultCurrency ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume requests"
        description="Candidates who asked us to prepare their resume (a paid service, never a placement fee). Collect the payment, mark it paid or waive it, then share the download link."
        actions={[
          <DownloadExcelButton key="excel" href="/admin/resume-requests/export" searchParams={sp} keys={["q", "status"]} />,
          <Button key="docx" asChild variant="outline" size="sm">
            <a href={templateHref("docx")} data-testid="blank-template-docx">
              <FileDown aria-hidden="true" />
              Download blank template (.docx)
            </a>
          </Button>,
          <Button key="pdf" asChild variant="outline" size="sm">
            <a href={templateHref("pdf")} data-testid="blank-template-pdf">
              <FileDown aria-hidden="true" />
              Download blank template (.pdf)
            </a>
          </Button>,
        ]}
      />
      {!enabled ? <p className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning-strong">The public form is switched off (Settings, Modules: “Prepare my resume” service).</p> : null}

      <nav aria-label="Resume request status" className="-mx-1 overflow-x-auto px-1">
        <ol className="flex min-w-max gap-2">
          {RESUME_REQUEST_STATUSES.map((s) => (
            <li key={s}>
              <a
                href={`/admin/resume-requests?status=${s}`}
                aria-current={filters.status === s ? "page" : undefined}
                className="flex min-w-28 flex-col rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors hover:border-teal/40 aria-[current=page]:border-teal aria-[current=page]:bg-teal-soft"
              >
                <span className="text-xs font-medium text-muted-foreground">{RESUME_REQUEST_STATUS_LABELS[s]}</span>
                <span className="font-heading text-xl font-semibold text-foreground">{counts[s]}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <FilterScope>
        <FilterBar paramKeys={["q", "status"]} search={<SearchInput label="Search by name, phone or reference" />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
        </FilterBar>
        <FilterChips filters={[{ param: "status", label: "Status", options: statusOptions }]} />
        <FilterPendingRegion>
          <DataTable
            caption="Resume requests"
            rows={result.items}
            getRowId={(r) => r.id}
            rowLink={(r) => ({ href: `/admin/resume-requests/${r.id}`, label: `Open resume request ${r.code}` })}
            columns={[
              {
                id: "candidate",
                header: "Candidate",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <Link href={`/admin/resume-requests/${r.id}`} className="font-medium text-navy underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{r.code}</p>
                  </div>
                ),
              },
              { id: "phone", header: "Phone", cell: (r) => <a href={`tel:${r.phone}`} className="font-medium text-navy underline-offset-4 hover:underline">{r.phone}</a> },
              { id: "post", header: "Post applied for", cell: (r) => r.postAppliedFor },
              { id: "price", header: "Price", hideOnMobile: true, cell: (r) => r.priceLabel },
              { id: "date", header: "Received", nowrap: true, cell: (r) => <RelativeTime value={r.createdAt} /> },
              { id: "status", header: "Status", cell: (r) => <StatusBadge tone={RESUME_REQUEST_STATUS_TONE[r.status]} size="sm">{RESUME_REQUEST_STATUS_LABELS[r.status]}</StatusBadge> },
            ]}
            empty={
              <EmptyState
                icon={<FileText />}
                title={filters.status || filters.q ? "No requests match these filters" : "No resume requests yet"}
                description="Requests sent through the Prepare my resume page (/resume-service) appear here, newest first."
              />
            }
            footer={<Pagination pathname="/admin/resume-requests" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="requests" />}
          />
        </FilterPendingRegion>
      </FilterScope>

      <SectionCard id="price" title="Price" description="Shown on /resume-service and saved on each new request. Leave at 0 to show “Price on request” and quote the price on WhatsApp.">
        <p className="mb-4 text-sm text-foreground">
          Current price: <strong className="font-semibold">{resumePriceLabel(price)}</strong>. Online payment is off until the Razorpay keys are configured; staff record payments here.
        </p>
        {canEditPrice ? (
          <ActionForm
            action={saveResumePriceAction}
            submitLabel="Save price"
            columns={2}
            fields={[
              { name: "amount", label: "Amount", kind: "number", required: true, min: 0, step: "0.01", defaultValue: price.currency ? fromMinorUnits(price.amountMinor, price.currency) : 0, hint: "0 = price on request" },
              { name: "currency", label: "Currency", kind: "select", required: true, options: currencies, defaultValue: priceCurrency },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Changing the price needs the settings permission.</p>
        )}
      </SectionCard>
    </div>
  );
}
