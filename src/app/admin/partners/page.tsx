import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { listAssignmentsForStaff } from "@/modules/recruitment/queries";

import { partnerOptions, requirementOptions } from "../pipeline/_shared/options";
import { isUuid, optionsFrom, pickEnum } from "../pipeline/_shared/server";
import { humanize, statusTone } from "../pipeline/_shared/status";
import { PartnerTabs } from "./_components/partner-tabs";

export const metadata: Metadata = { title: "Partner assignments" };

const STATUSES = ["active", "paused", "completed", "revoked"] as const;

export default async function PartnerAssignmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["partners.view", "partners.assign"], "any");
  const params = await searchParams;
  const page = parsePage(params);
  const partnerParam = sp(params, "partner");
  const requirementParam = sp(params, "requirement");
  const status = pickEnum(sp(params, "status"), STATUSES);
  const filters = { partnerOrganizationId: isUuid(partnerParam) ? partnerParam : undefined, requirementId: isUuid(requirementParam) ? requirementParam : undefined, status };
  const [result, partners, requirements] = await Promise.all([
    listAssignmentsForStaff(staff, filters, page),
    partnerOptions(),
    requirementOptions({ includeIds: filters.requirementId ? [filters.requirementId] : [] }),
  ]);
  const canAssign = staffCan(staff, "partners.assign");
  const statusOptions = optionsFrom(STATUSES);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner assignments"
        description="Requirements and jobs assigned to recruitment partners. Partners only see their own assignments and never Venkat Sai's commercial terms with employers."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Partners" }]}
        actions={canAssign ? [{ label: "New assignment", href: "/admin/partners/new" }] : undefined}
      />
      <PartnerTabs />
      <FilterScope>
        <FilterBar paramKeys={["partner", "requirement", "status"]}>
          <FilterSelect param="partner" label="Partner" allLabel="All partners" options={partners} />
          <FilterSelect param="requirement" label="Requirement" allLabel="All requirements" options={requirements} />
          <FilterSelect param="status" label="Status" allLabel="All statuses" options={statusOptions} />
        </FilterBar>
        <FilterChips filters={[{ param: "partner", label: "Partner", options: partners }, { param: "requirement", label: "Requirement", options: requirements }, { param: "status", label: "Status", options: statusOptions }]} />
        <FilterPendingRegion>
          <DataTable
            caption="Partner assignments"
            rows={result.items}
            getRowId={(a) => a.id}
            rowLink={(a) => ({ href: `/admin/partners/${a.id}`, label: `Open assignment ${a.title} for ${a.partnerName}` })}
            columns={[
              { id: "title", header: "Assignment", primary: true, cell: (a) => (<div><p className="font-medium">{a.title || "Untitled"}</p><p className="font-mono text-xs text-muted-foreground">{a.requirement?.code ?? a.job?.code ?? ""}</p></div>) },
              { id: "partner", header: "Partner", cell: (a) => a.partnerName },
              { id: "progress", header: "Submissions", align: "right", cell: (a) => `${a.submissionsUsed}${a.submissionLimit ? ` / ${a.submissionLimit}` : ""}` },
              { id: "target", header: "Target", align: "right", hideOnMobile: true, cell: (a) => a.positionsTarget ?? "—" },
              { id: "due", header: "Due", hideOnMobile: true, cell: (a) => (a.dueDate ? <DateText value={a.dueDate} dateOnly /> : "—") },
              { id: "status", header: "Status", cell: (a) => <StatusBadge tone={statusTone(a.status)} size="sm">{humanize(a.status)}</StatusBadge> },
            ]}
            empty={<EmptyState title="No assignments found" description={status || filters.partnerOrganizationId || filters.requirementId ? "Try different filters." : "Assign an approved requirement or a published job to a verified partner."} primaryAction={canAssign ? { label: "New assignment", href: "/admin/partners/new" } : undefined} />}
            footer={<Pagination pathname="/admin/partners" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="assignments" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
