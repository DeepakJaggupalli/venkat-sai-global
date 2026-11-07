import { Briefcase } from "lucide-react";

import { OrgAvatar } from "@/components/shared/avatars";
import { DataTable } from "@/components/shared/data-table/data-table";
import type { DataTableColumn } from "@/components/shared/data-table/types";
import { parseSort } from "@/components/shared/data-table/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter } from "@/components/shared/filters/date-range-filter";
import { FilterBar } from "@/components/shared/filters/filter-bar";
import { FilterChips } from "@/components/shared/filters/filter-chips";
import { FilterSelect } from "@/components/shared/filters/filter-select";
import { SearchInput } from "@/components/shared/filters/search-input";
import { FilterPendingRegion, FilterScope } from "@/components/shared/filters/use-url-filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { SalaryRangeText } from "@/components/shared/money-text";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { parsePage, type SearchParams } from "@/lib/http";

import { SelectableTableDemo } from "../_components/selectable-table-demo";
import { DemoLabel, ShowcaseSection } from "../_components/showcase-section";

type SampleJob = { id: string; code: string; title: string; employer: string; status: string; source: string; salaryMin: number; salaryMax: number; currency: string; applications: number };

const JOBS: SampleJob[] = [
  { id: "j1", code: "JOB-SAMPLE-0001", title: "Sample Welder (GTAW)", employer: "Example Co.", status: "published", source: "verified", salaryMin: 250_000, salaryMax: 320_000, currency: "AED", applications: 14 },
  { id: "j2", code: "JOB-SAMPLE-0002", title: "Sample Pipe Fitter", employer: "Example Co.", status: "pending_approval", source: "pending_review", salaryMin: 180_000, salaryMax: 220_000, currency: "QAR", applications: 0 },
  { id: "j3", code: "JOB-SAMPLE-0003", title: "Sample Fabrication Trainee", employer: "Sample Industries", status: "draft", source: "employer_supplied", salaryMin: 1_800_000, salaryMax: 2_400_000, currency: "INR", applications: 3 },
];

const STATUS_OPTIONS = [
  { value: "published", label: "Published" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "draft", label: "Draft" },
];

const SORT_KEYS = ["title", "applications"] as const;

const COLUMNS: DataTableColumn<SampleJob>[] = [
  {
    id: "title",
    header: "Job",
    primary: true,
    sortKey: true,
    cell: (j) => (
      <span className="flex items-center gap-3">
        <OrgAvatar name={j.employer} size="sm" />
        <span className="min-w-0">
          <span className="block font-medium text-foreground">{j.title}</span>
          <span className="block text-xs text-muted-foreground">
            {j.code} · {j.employer}
          </span>
        </span>
      </span>
    ),
  },
  { id: "status", header: "Status", cell: (j) => <StatusBadge status={j.status} domain="job" size="sm" /> },
  { id: "source", header: "Information", cell: (j) => <VerificationBadge state={j.source} variant="inline" />, hideOnMobile: true },
  { id: "salary", header: "Salary (sample)", cell: (j) => <SalaryRangeText minMinor={j.salaryMin} maxMinor={j.salaryMax} currency={j.currency} period="month" /> },
  { id: "applications", header: "Applications", align: "right", sortKey: true, cell: (j) => j.applications },
];

export function NavigationSections({ searchParams }: { searchParams: SearchParams }) {
  const sort = parseSort(searchParams, SORT_KEYS, { by: "title", dir: "asc" });
  const rows = [...JOBS].sort((a, b) => {
    const cmp = sort.by === "applications" ? a.applications - b.applications : a.title.localeCompare(b.title);
    return sort.dir === "asc" ? cmp : -cmp;
  });
  const { page } = parsePage(searchParams);

  return (
    <>
      <ShowcaseSection id="tabs" title="Tabs as links" description="Real links with aria-current; the active tab follows the URL.">
        <LinkTabs
          label="Sample job views"
          items={[
            { href: "/dev/ui", label: "All", count: 3 },
            { href: "/dev/ui?view=published", label: "Published", count: 1 },
            { href: "/dev/ui?view=drafts", label: "Drafts", count: 1 },
            { href: "/dev/ui?view=closed", label: "Closed", count: 0 },
          ]}
        />
      </ShowcaseSection>

      <ShowcaseSection id="filters" title="Filters" description="Search, selects, date range and chips sync to the URL (debounced). Results dim while the page reloads.">
        <FilterScope>
          <FilterBar paramKeys={["q", "status", "from", "to"]} label="Filter sample jobs" search={<SearchInput label="Search sample jobs" placeholder="Title or code" />}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={STATUS_OPTIONS} />
            <DateRangeFilter label="Posted" />
          </FilterBar>
          <FilterChips
            className="mt-3"
            filters={[
              { param: "q", label: "Search" },
              { param: "status", label: "Status", options: STATUS_OPTIONS },
              { param: "from", label: "From", kind: "date" },
              { param: "to", label: "To", kind: "date" },
            ]}
          />
          <FilterPendingRegion className="mt-4">
            <DemoLabel>Current query (sample results are not filtered)</DemoLabel>
            <pre className="overflow-x-auto rounded-lg bg-secondary px-3 py-2 text-xs">{JSON.stringify(searchParams)}</pre>
          </FilterPendingRegion>
        </FilterScope>
      </ShowcaseSection>

      <ShowcaseSection id="data-table" title="Data table" description="Server-rendered, sortable by URL, row links, stacked cards below the md breakpoint.">
        <DataTable
          caption="Sample job postings"
          rows={rows}
          columns={COLUMNS}
          getRowId={(j) => j.id}
          rowLink={(j) => ({ href: `/dev/ui?job=${j.id}#data-table`, label: `Open ${j.title}` })}
          sort={{ by: sort.by, dir: sort.dir, pathname: "/dev/ui", searchParams }}
          footer={<Pagination pathname="/dev/ui" searchParams={searchParams} page={page} pageCount={7} total={132} pageSize={20} itemLabel="sample jobs" />}
        />
        <div>
          <DemoLabel>Empty table</DemoLabel>
          <DataTable
            caption="Empty sample table"
            rows={[] as SampleJob[]}
            columns={COLUMNS}
            getRowId={(j) => j.id}
            empty={<EmptyState variant="plain" icon={<Briefcase />} title="No matching jobs" description="Try removing a filter." />}
          />
        </div>
        <div>
          <DemoLabel>Selectable table with bulk actions</DemoLabel>
          <SelectableTableDemo />
        </div>
      </ShowcaseSection>
    </>
  );
}
