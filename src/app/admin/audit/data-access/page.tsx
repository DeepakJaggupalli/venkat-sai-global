import type { Metadata } from "next";
import { Eye } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { humanize } from "@/lib/format";
import { parsePage, withParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { DownloadLink } from "../../settings/_components/download-link";
import { AuditNav, MetadataDetails, PersonLink } from "../_components/audit-ui";
import { dataAccessCategories, dataAccessFilterSchema, listDataAccessLogs } from "../_lib/queries";

export const metadata: Metadata = { title: "Data access log" };

type SP = Record<string, string | string[] | undefined>;
const PARAMS = ["actor", "subject", "category", "accessType", "from", "to"] as const;
const accessOptions = ["view", "reveal", "download", "export", "share"].map((v) => ({ value: v, label: humanize(v) }));

export default async function DataAccessPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("audit.view");
  const tz = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const sp = await searchParams;
  const f = dataAccessFilterSchema.parse(Object.fromEntries(PARAMS.map((k) => [k, sp[k]])));
  const page = parsePage(sp, { defaultSize: 50, maxSize: 100 });
  const [result, categories] = await Promise.all([listDataAccessLogs(f, page, tz), dataAccessCategories()]);
  const canUsers = staffCan(ctx, "users.view");
  const categoryOptions = categories.map((c) => ({ value: c, label: humanize(c) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data access log"
        description="Every view, reveal, download, export or share of sensitive personal data by staff and organisations, with the stated reason."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Audit logs", href: "/admin/audit" }, { label: "Data access" }]}
        actions={<DownloadLink href={withParams("/admin/audit/export", sp, { log: "data-access", page: null })} label="Export CSV" />}
      />
      <AuditNav />
      <FilterScope>
        <FilterBar paramKeys={[...PARAMS]} search={<SearchInput param="actor" label="Search by who accessed (name, e-mail or ID)" />}>
          <SearchInput param="subject" label="Whose data (name, e-mail or ID)" showLabel />
          <FilterSelect param="category" label="Data category" allLabel="All categories" options={categoryOptions} />
          <FilterSelect param="accessType" label="Access" allLabel="Any access" options={accessOptions} />
          <DateRangeFilter label="Date" />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "actor", label: "Accessed by" },
            { param: "subject", label: "Whose data" },
            { param: "category", label: "Category", options: categoryOptions },
            { param: "accessType", label: "Access", options: accessOptions },
            { param: "from", label: "From", kind: "date" },
            { param: "to", label: "To", kind: "date" },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Data access log"
            rows={result.items}
            getRowId={(r) => String(r.id)}
            columns={[
              { id: "when", header: "When", nowrap: true, cell: (r) => <DateText value={r.occurredAt} mode="datetime" timeZone={tz} /> },
              {
                id: "what",
                header: "Access",
                primary: true,
                cell: (r) => (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={r.accessType === "export" || r.accessType === "share" ? "warning" : "info"} size="sm">
                      {humanize(r.accessType)}
                    </StatusBadge>
                    <span className="font-medium">{humanize(r.dataCategory)}</span>
                  </span>
                ),
              },
              {
                id: "actor",
                header: "By",
                cell: (r) => (
                  <span className="flex flex-col">
                    <PersonLink id={r.actorUserId} name={r.actorName} fallback="System" canOpen={canUsers} />
                    {r.actorOrganizationName ? <span className="text-xs text-muted-foreground">{r.actorOrganizationName}</span> : null}
                  </span>
                ),
              },
              {
                id: "subject",
                header: "Whose data",
                cell: (r) => (
                  <span className="flex flex-col">
                    <PersonLink id={r.subjectUserId} name={r.subjectName} fallback={humanize(r.subjectType)} canOpen={canUsers} />
                    <span className="text-xs text-muted-foreground">
                      {humanize(r.subjectType)} · {r.subjectId}
                    </span>
                  </span>
                ),
              },
              { id: "reason", header: "Reason", hideOnMobile: true, cell: (r) => r.reason ?? <span className="text-muted-foreground">Not given</span> },
              { id: "details", header: "Details", cell: (r) => <MetadataDetails metadata={r.metadata} /> },
            ]}
            empty={<EmptyState icon={<Eye />} title="No access entries match" description="Try a wider date range or fewer filters." />}
            footer={<Pagination pathname="/admin/audit/data-access" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="entries" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
