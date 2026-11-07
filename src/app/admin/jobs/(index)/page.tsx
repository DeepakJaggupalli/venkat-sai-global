import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { listOrganizationOptions } from "@/components/admin/queries";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { humanize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { INFO_SOURCE_OPTIONS, JOB_STATUS_OPTIONS } from "@/modules/jobs/constants";
import { listAdminJobs } from "@/modules/jobs/queries";
import { parseJobSearchParams } from "@/modules/jobs/schemas";

import { bulkApproveJobsAction, bulkPublishJobsAction, bulkResumeJobsAction, bulkUnpublishJobsAction } from "../actions";
import { AdminJobsTable, type AdminJobRow } from "../jobs-table";

export const metadata: Metadata = { title: "Jobs" };

type SP = Record<string, string | string[] | undefined>;

const statusOptions = JOB_STATUS_OPTIONS.map((s) => ({ value: s, label: humanize(s) }));
const infoOptions = INFO_SOURCE_OPTIONS.map((s) => ({ value: s, label: humanize(s) }));
const yes = [{ value: "true", label: "Yes" }];

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("jobs.view");
  const sp = await searchParams;
  const filters = parseJobSearchParams({ ...sp, sort: typeof sp.sort === "string" ? sp.sort : "newest" });
  const [result, employers] = await Promise.all([listAdminJobs(ctx, filters), listOrganizationOptions("employer")]);
  const canDecide = staffCan(ctx, ["approvals.decide", "jobs.approve"]);
  const canPublish = staffCan(ctx, ["jobs.manage", "jobs.approve"]);
  const canManage = staffCan(ctx, "jobs.manage");

  const rows: AdminJobRow[] = result.items.map((j) => ({
    id: j.id,
    code: j.code,
    title: j.title,
    employer: j.employer.name,
    confidential: j.employer.confidential,
    organizationName: j.organizationName,
    location: [j.location.city, j.location.countryName ?? j.location.countryCode].filter(Boolean).join(", "),
    status: j.status,
    displayStatus: j.displayStatus,
    isFeatured: j.isFeatured,
    isOverseas: j.isOverseas,
    applicationCount: j.applicationCount,
    closesAt: j.closesAt?.toISOString() ?? null,
    publishedAt: j.publishedAt?.toISOString() ?? null,
  }));
  const countryOptions = (result.facets?.countries ?? []).map((c) => ({ value: c.value, label: `${c.label} (${c.count})` }));
  const categoryOptions = (result.facets?.categories ?? []).map((c) => ({ value: c.value, label: `${c.label} (${c.count})` }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Every job on the platform: review submissions, publish Venkat Sai-managed roles and keep listings current."
        actions={canManage ? [{ label: "Create job", href: "/admin/jobs/new", icon: <Plus /> }] : undefined}
      />
      <LinkTabs
        label="Job views"
        items={[
          { href: "/admin/jobs", label: "All jobs" },
          { href: "/admin/jobs?statuses=pending_approval", label: "Awaiting approval" },
          { href: "/admin/jobs?statuses=published", label: "Published" },
          { href: "/admin/jobs?managedOnly=true", label: "Venkat Sai-managed" },
          { href: "/admin/jobs?statuses=closed", label: "Closed" },
        ]}
      />
      <FilterScope>
        <FilterBar
          paramKeys={["q", "statuses", "organizationId", "countryCodes", "categoryIds", "overseas", "featuredOnly", "managedOnly", "infoSource", "sort"]}
          search={<SearchInput label="Search title, skills, city or code" />}
        >
          <FilterSelect param="statuses" label="Status" allLabel="Any status" options={statusOptions} />
          <FilterSelect param="organizationId" label="Employer" allLabel="All employers" options={employers} />
          <FilterSelect param="countryCodes" label="Country" allLabel="All countries" options={countryOptions} />
          <FilterSelect param="categoryIds" label="Category" allLabel="All categories" options={categoryOptions} />
          <FilterSelect param="overseas" label="Overseas" allLabel="Any location" options={[{ value: "true", label: "Overseas only" }]} />
          <FilterSelect param="featuredOnly" label="Featured" allLabel="Any" options={yes} />
          <FilterSelect param="managedOnly" label="Venkat Sai-managed" allLabel="Any" options={yes} />
          <FilterSelect param="infoSource" label="Information" allLabel="Any source" options={infoOptions} />
          <FilterSelect
            param="sort"
            label="Sort"
            allLabel="Newest"
            options={[
              { value: "closing", label: "Closing soon" },
              { value: "relevance", label: "Relevance" },
              { value: "salary", label: "Salary" },
            ]}
          />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "statuses", label: "Status", options: statusOptions },
            { param: "organizationId", label: "Employer", options: employers },
            { param: "countryCodes", label: "Country", options: countryOptions },
            { param: "categoryIds", label: "Category", options: categoryOptions },
            { param: "overseas", label: "Overseas", options: yes },
            { param: "featuredOnly", label: "Featured", options: yes },
            { param: "managedOnly", label: "Managed", options: yes },
            { param: "infoSource", label: "Information", options: infoOptions },
          ]}
        />
        <FilterPendingRegion>
          <AdminJobsTable
            rows={rows}
            actions={{
              approve: canDecide ? bulkApproveJobsAction : undefined,
              publish: canPublish ? bulkPublishJobsAction : undefined,
              unpublish: canManage ? bulkUnpublishJobsAction : undefined,
              resume: canManage ? bulkResumeJobsAction : undefined,
            }}
            can={{ decide: canDecide, manage: canManage, feature: staffCan(ctx, "jobs.feature") }}
          />
          <Pagination pathname="/admin/jobs" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="jobs" />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
