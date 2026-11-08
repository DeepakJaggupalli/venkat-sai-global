import { Download, FileUser, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import { parsePage, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import {
  CV_SUBMISSION_STATUS_LABELS,
  CV_SUBMISSION_STATUS_TONE,
  CV_SUBMISSION_STATUS_VALUES,
  cvSubmissionFiltersSchema,
} from "@/modules/operations/cv-submission-schemas";
import { cvSubmissionCounts, listCvSubmissions, listCvSubmissionTrades, type CvSubmissionListItem } from "@/modules/operations/cv-submissions";
import { countryOptions } from "@/modules/taxonomy/queries";

import { setCvSubmissionStatusAction } from "./actions";

export const metadata: Metadata = { title: "CV submissions" };

const statusOptions = CV_SUBMISSION_STATUS_VALUES.map((value) => ({ value, label: CV_SUBMISSION_STATUS_LABELS[value] }));

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The candidate's WhatsApp chat (wa.me with their own number), with a short greeting. */
function candidateWhatsApp(item: CvSubmissionListItem): string | null {
  if (!item.phone) return null;
  return whatsappHref(`Hello ${item.name}, this is Venkat Sai Global about the CV you sent for ${item.tradeLabel}.`, item.phone);
}

export default async function CvSubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("candidates.view");
  const sp = await searchParams;
  const filters = cvSubmissionFiltersSchema.parse({ status: str(sp.status), trade: str(sp.trade), country: str(sp.country), q: str(sp.q) });
  const page = parsePage(sp, { defaultSize: 25 });
  const [result, counts, trades, countries] = await Promise.all([listCvSubmissions(ctx, filters, page), cvSubmissionCounts(ctx), listCvSubmissionTrades(ctx), countryOptions()]);
  const canManage = staffCan(ctx, "candidates.manage");
  const canContact = staffCan(ctx, "candidates.view_contact");

  return (
    <div className="space-y-6">
      <PageHeader
        title="CV submissions"
        description="CVs sent through the website's Send your CV form. Call or WhatsApp the candidate, then update the status."
      />
      {!canContact ? <p className="text-sm text-muted-foreground">Phone numbers are hidden: they need the permission to view candidate contact details.</p> : null}

      <nav aria-label="CV submission status" className="-mx-1 overflow-x-auto px-1">
        <ol className="flex min-w-max gap-2">
          {CV_SUBMISSION_STATUS_VALUES.map((s) => (
            <li key={s}>
              <a
                href={`/admin/cv-submissions?status=${s}`}
                aria-current={filters.status === s ? "page" : undefined}
                className="flex min-w-28 flex-col rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors hover:border-teal/40 aria-[current=page]:border-teal aria-[current=page]:bg-teal-soft"
              >
                <span className="text-xs font-medium text-muted-foreground">{CV_SUBMISSION_STATUS_LABELS[s]}</span>
                <span className="font-heading text-xl font-semibold text-foreground">{counts[s]}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <FilterScope>
        <FilterBar paramKeys={["q", "status", "trade", "country"]} search={<SearchInput label="Search by name, phone, trade, requirement or reference" />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
          <FilterSelect param="trade" label="Trade" allLabel="All trades" options={trades} />
          <FilterSelect param="country" label="Preferred country" allLabel="Any country" options={countries} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            { param: "trade", label: "Trade", options: trades },
            { param: "country", label: "Country", options: countries },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="CV submissions"
            rows={result.items}
            getRowId={(s) => s.id}
            columns={[
              {
                id: "candidate",
                header: "Candidate",
                primary: true,
                cell: (s) => (
                  <div className="min-w-0" data-testid="cv-row">
                    <Link href={`/admin/cv-submissions/${s.id}`} className="font-medium text-navy underline-offset-4 hover:underline" data-testid="cv-open">
                      {s.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {s.code}
                      {s.experienceYears !== null ? ` · ${s.experienceYears} yrs` : ""}
                      {s.passportLast4 ? ` · Passport …${s.passportLast4}` : s.hasPassport === true ? " · Passport" : s.hasPassport === false ? " · No passport" : ""}
                    </p>
                  </div>
                ),
              },
              {
                id: "phone",
                header: "Phone",
                cell: (s) =>
                  s.phone ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`tel:${s.phone}`} className="inline-flex min-h-9 items-center gap-1 font-medium text-navy underline-offset-4 hover:underline">
                        <Phone className="size-4" aria-hidden="true" />
                        {s.phone}
                      </a>
                      <a href={candidateWhatsApp(s)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-success-strong hover:bg-success-soft">
                        <MessageCircle className="size-4" aria-hidden="true" />
                        WhatsApp
                        <span className="sr-only"> {s.name}</span>
                      </a>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{s.phoneMasked}</span>
                  ),
              },
              { id: "trade", header: "Trade", cell: (s) => s.tradeLabel },
              { id: "country", header: "Country", hideOnMobile: true, cell: (s) => s.countryName ?? <span className="text-muted-foreground">Any</span> },
              { id: "requirement", header: "Requirement", hideOnMobile: true, cell: (s) => s.requirementTitle ?? <span className="text-muted-foreground">General</span> },
              { id: "date", header: "Received", nowrap: true, cell: (s) => <RelativeTime value={s.createdAt} /> },
              { id: "status", header: "Status", cell: (s) => <StatusBadge tone={CV_SUBMISSION_STATUS_TONE[s.status]} size="sm">{CV_SUBMISSION_STATUS_LABELS[s.status]}</StatusBadge> },
              {
                id: "actions",
                header: "CV and status",
                cell: (s) => (
                  <div className="flex flex-wrap gap-2">
                    {s.cvUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={s.cvUrl} data-testid="cv-download">
                          <Download aria-hidden="true" />
                          CV
                          <span className="sr-only"> of {s.name}</span>
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{s.cvBlocked ? "CV waiting for the security scan" : "No access to CVs"}</span>
                    )}
                    {canManage ? (
                      <ResponsiveDialog
                        title={`Update ${s.name}`}
                        description="Record the outcome of your call or WhatsApp message. Add remarks on the detail page."
                        trigger={
                          <Button variant="outline" size="sm" data-testid="cv-status">
                            Status
                          </Button>
                        }
                      >
                        <ActionForm
                          action={setCvSubmissionStatusAction}
                          hidden={{ id: s.id }}
                          submitLabel="Save"
                          fields={[
                            { name: "status", label: "Status", kind: "select", required: true, options: statusOptions, defaultValue: s.status },
                          ]}
                        />
                      </ResponsiveDialog>
                    ) : null}
                  </div>
                ),
              },
            ]}
            empty={
              <EmptyState
                icon={<FileUser />}
                title={filters.status || filters.trade || filters.country || filters.q ? "No CVs match these filters" : "No CVs yet"}
                description="CVs sent through the Send your CV page (/send-cv) appear here, newest first."
              />
            }
            footer={<Pagination pathname="/admin/cv-submissions" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="CVs" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
