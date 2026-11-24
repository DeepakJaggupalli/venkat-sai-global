import { ExternalLink, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DownloadExcelButton } from "@/components/admin/download-excel-button";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { parsePage, sp as pick, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getPosterCriteria } from "@/modules/operations/cv-matching";
import { CV_SUBMISSION_STATUS_LABELS, CV_SUBMISSION_STATUS_VALUES, cvSubmissionFiltersSchema } from "@/modules/operations/cv-submission-schemas";
import { cvSubmissionCounts, listCvSubmissions, posterApplicantsPath } from "@/modules/operations/cv-submissions";

import { applicantColumns } from "@/app/admin/cv-submissions/_components/applicant-columns";
import { CopyPhonesButton } from "./_components/copy-phones-button";

export const metadata: Metadata = { title: "Applicants" };

const statusOptions = CV_SUBMISSION_STATUS_VALUES.map((value) => ({ value, label: CV_SUBMISSION_STATUS_LABELS[value] }));

/**
 * Everyone who applied from one requirement poster (content.view + candidates.view): S.No, Name, Trade, Passport No,
 * experience abroad and in India, Email, Phone with Call and WhatsApp, Applied on, Status. Search by name, phone or
 * passport last 4; filter by status; copy all phone numbers (logged); Download Excel (same columns, logged).
 */
export default async function PosterApplicantsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff(["content.view", "candidates.view"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const criteria = await getPosterCriteria(ctx, id);
  if (!criteria) notFound();
  const filters = cvSubmissionFiltersSchema.parse({ q: pick(sp, "q"), status: pick(sp, "status"), requirement: criteria.ref.id });
  const page = parsePage(sp, { defaultSize: 50 });
  const [result, counts] = await Promise.all([listCvSubmissions(ctx, filters, page), cvSubmissionCounts(ctx, { requirement: criteria.ref.id })]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const canManage = staffCan(ctx, "candidates.manage");
  const canContact = staffCan(ctx, "candidates.view_contact");
  const path = posterApplicantsPath(criteria.ref.id);
  const filtered = Boolean(filters.q || filters.status);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Requirement posters", href: "/admin/requirements/posters" }, { label: criteria.title }, { label: "Applicants" }]} />
      <PageHeader
        eyebrow="Requirement poster"
        title={`Applicants (${total})`}
        description={`${criteria.title}${criteria.countryName ? ` · ${criteria.countryName}` : ""}. Everyone who tapped Apply on this poster, newest first.`}
        backLink={{ href: "/admin/requirements/posters", label: "Back to posters" }}
        actions={
          <div className="flex flex-wrap gap-2">
            <DownloadExcelButton href="/admin/cv-submissions/export" searchParams={{ ...sp, requirement: criteria.ref.id }} keys={["requirement", "q", "status"]} className="min-h-11 md:min-h-7" />
            {canContact && total > 0 ? <CopyPhonesButton posterId={criteria.ref.id} q={filters.q} status={filters.status} /> : null}
            <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-7">
              <Link href={`/admin/requirements/posters/${criteria.ref.id}/matches`}>
                <Users aria-hidden="true" />
                Matching CVs
              </Link>
            </Button>
            {criteria.publicUrl ? (
              <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-7">
                <a href={criteria.publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Public page
                </a>
              </Button>
            ) : null}
          </div>
        }
      />
      {!canContact ? <p className="text-sm text-muted-foreground">Phone numbers and emails are partly hidden: they need the permission to view candidate contact details.</p> : null}

      {total > 0 ? (
        <nav aria-label="Applicants by status" className="-mx-1 overflow-x-auto px-1">
          <ol className="flex min-w-max gap-2">
            {CV_SUBMISSION_STATUS_VALUES.filter((s) => counts[s] > 0).map((s) => (
              <li key={s}>
                <a
                  href={`${path}?status=${s}`}
                  aria-current={filters.status === s ? "page" : undefined}
                  className="flex min-h-11 min-w-24 flex-col rounded-xl border border-border bg-card px-3 py-2 shadow-xs transition-colors hover:border-teal/40 aria-[current=page]:border-teal aria-[current=page]:bg-teal-soft"
                >
                  <span className="text-xs font-medium text-muted-foreground">{CV_SUBMISSION_STATUS_LABELS[s]}</span>
                  <span className="font-heading text-lg font-semibold text-foreground tabular-nums">{counts[s]}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <FilterScope>
        <FilterBar paramKeys={["q", "status"]} search={<SearchInput label="Search by name, phone or passport last 4" />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
        </FilterBar>
        <FilterChips filters={[{ param: "status", label: "Status", options: statusOptions }]} />
        <FilterPendingRegion>
          <DataTable
            caption={`Applicants for ${criteria.title}`}
            rows={result.items}
            getRowId={(s) => s.id}
            stackBelow="lg"
            columns={applicantColumns({ offset: (result.page - 1) * result.pageSize, canManage, showRequirement: false })}
            empty={
              <EmptyState
                icon={<Users />}
                title={filtered ? "No applicants match this search" : "No applicants yet"}
                description={
                  filtered
                    ? "Clear the search or the status filter to see everyone who applied."
                    : "People who tap Apply on this poster appear here. Share the poster on WhatsApp to get applications."
                }
                primaryAction={!filtered && criteria.publicUrl ? { label: "Open the public poster", href: criteria.publicUrl } : undefined}
              />
            }
            footer={<Pagination pathname={path} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="applicants" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
