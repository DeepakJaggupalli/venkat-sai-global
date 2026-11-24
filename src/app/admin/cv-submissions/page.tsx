import { FileSpreadsheet, FileUser } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DownloadExcelButton } from "@/components/admin/download-excel-button";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { parsePage, sp as pick, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import {
  CV_FILE_FILTER_LABELS,
  CV_SUBMISSION_FILTER_KEYS,
  CV_SUBMISSION_SOURCE_LABELS,
  CV_SUBMISSION_SOURCE_VALUES,
  CV_SUBMISSION_STATUS_LABELS,
  CV_SUBMISSION_STATUS_VALUES,
  cvSubmissionFiltersSchema,
} from "@/modules/operations/cv-submission-schemas";
import { cvSubmissionCounts, listCvSubmissionRequirements, listCvSubmissions, listCvSubmissionTrades } from "@/modules/operations/cv-submissions";
import { countryOptions } from "@/modules/taxonomy/queries";

import { applicantColumns } from "./_components/applicant-columns";

export const metadata: Metadata = { title: "Applicants and CVs" };

const statusOptions = CV_SUBMISSION_STATUS_VALUES.map((value) => ({ value, label: CV_SUBMISSION_STATUS_LABELS[value] }));
const sourceOptions = CV_SUBMISSION_SOURCE_VALUES.map((value) => ({ value, label: CV_SUBMISSION_SOURCE_LABELS[value] }));
const cvOptions = (["yes", "no"] as const).map((value) => ({ value, label: CV_FILE_FILTER_LABELS[value] }));
const expiringOptions = [{ value: "1", label: "Passport expiring (6 months)" }];

/**
 * Everyone who applied (website quick apply, with or without a CV, and rows imported from Excel), newest first, with
 * S.No, Name, Trade, Passport No, experience abroad and in India, Email, Phone (call / WhatsApp), Applied for,
 * Applied on and Status. Filters: status, requirement poster, trade, country, source, has CV, passport expiry.
 */
export default async function CvSubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("candidates.view");
  const sp = await searchParams;
  const filters = cvSubmissionFiltersSchema.parse(Object.fromEntries(CV_SUBMISSION_FILTER_KEYS.map((k) => [k, pick(sp, k)])));
  const page = parsePage(sp, { defaultSize: 25 });
  const [result, counts, trades, countries, requirements] = await Promise.all([
    listCvSubmissions(ctx, filters, page),
    cvSubmissionCounts(ctx),
    listCvSubmissionTrades(ctx),
    countryOptions(),
    listCvSubmissionRequirements(ctx),
  ]);
  const canManage = staffCan(ctx, "candidates.manage");
  const canContact = staffCan(ctx, "candidates.view_contact");
  const canSeePassports = staffCan(ctx, "candidates.view_documents");
  const filtered = CV_SUBMISSION_FILTER_KEYS.some((k) => filters[k] !== undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applicants and CVs"
        description="Everyone who applied on the website, with or without a CV, and CVs imported from Excel. Call or WhatsApp the person, then update the status."
        actions={
          <div className="flex flex-wrap gap-2">
            <DownloadExcelButton href="/admin/cv-submissions/export" searchParams={sp} keys={CV_SUBMISSION_FILTER_KEYS} className="min-h-11 md:min-h-7" />
            {canManage ? (
              <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-7">
                <Link href="/admin/cv-submissions/import" data-testid="cv-import-link">
                  <FileSpreadsheet aria-hidden="true" />
                  Import from Excel
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      {!canContact || !canSeePassports ? (
        <p className="text-sm text-muted-foreground">
          {!canContact ? "Phone numbers and emails are partly hidden: they need the permission to view candidate contact details. " : ""}
          {!canSeePassports ? "Passport numbers show only the last 4 characters: the full number needs the permission to open candidate documents." : ""}
        </p>
      ) : null}

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
                <span className="font-heading text-xl font-semibold text-foreground tabular-nums">{counts[s]}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <FilterScope>
        <FilterBar paramKeys={CV_SUBMISSION_FILTER_KEYS} search={<SearchInput label="Search by name, phone, passport last 4, email, trade or reference" />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
          <FilterSelect param="requirement" label="Applied for" allLabel="Any requirement" options={requirements} />
          <FilterSelect param="trade" label="Trade" allLabel="All trades" options={trades} />
          <FilterSelect param="country" label="Preferred country" allLabel="Any country" options={countries} />
          <FilterSelect param="source" label="Source" allLabel="Any source" options={sourceOptions} />
          <FilterSelect param="cv" label="CV" allLabel="With or without CV" options={cvOptions} />
          <FilterSelect param="expiring" label="Expiring soon" allLabel="Any passport expiry" options={expiringOptions} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            { param: "requirement", label: "Applied for", options: requirements },
            { param: "trade", label: "Trade", options: trades },
            { param: "country", label: "Country", options: countries },
            { param: "source", label: "Source", options: sourceOptions },
            { param: "cv", label: "CV", options: cvOptions },
            { param: "expiring", label: "Expiring soon", options: expiringOptions },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Applicants and CVs"
            rows={result.items}
            getRowId={(s) => s.id}
            stackBelow="lg"
            columns={applicantColumns({ offset: (result.page - 1) * result.pageSize, canManage })}
            empty={
              <EmptyState
                icon={<FileUser />}
                title={filtered ? "No applications match these filters" : "No applications yet"}
                description="People who apply on the website (Apply now on a requirement, or /send-cv) appear here, newest first."
              />
            }
            footer={<Pagination pathname="/admin/cv-submissions" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="applications" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
