import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

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

import { DownloadLink } from "../settings/_components/download-link";
import { AuditNav, MetadataDetails, PersonLink } from "./_components/audit-ui";
import { auditEntityTypes, auditFilterSchema, listAuditLogs, organizationName } from "./_lib/queries";

export const metadata: Metadata = { title: "Audit logs" };

type SP = Record<string, string | string[] | undefined>;
const PARAMS = ["actor", "action", "entity", "entityId", "org", "from", "to"] as const;

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("audit.view");
  const tz = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const sp = await searchParams;
  const f = auditFilterSchema.parse(Object.fromEntries(PARAMS.map((k) => [k, sp[k]])));
  const page = parsePage(sp, { defaultSize: 50, maxSize: 100 });
  const [result, entityTypes, orgName] = await Promise.all([listAuditLogs(f, page, tz), auditEntityTypes(), f.org ? organizationName(f.org) : Promise.resolve(null)]);
  const canUsers = staffCan(ctx, "users.view");
  const entityOptions = entityTypes.map((t) => ({ value: t, label: humanize(t) }));
  const exportHref = withParams("/admin/audit/export", sp, { log: "audit", page: null });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit logs"
        description="Every business and compliance action recorded on the platform. Entries are append-only and cannot be edited."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Audit logs" }]}
        actions={<DownloadLink href={exportHref} label="Export CSV" testId="audit-export" />}
      />
      <AuditNav />
      <FilterScope>
        <FilterBar paramKeys={[...PARAMS]} search={<SearchInput param="actor" label="Search by person (name, e-mail or account ID)" />}>
          <SearchInput param="action" label="Action starts with" placeholder="e.g. job. or settings.updated" showLabel />
          <FilterSelect param="entity" label="Record type" allLabel="All record types" options={entityOptions} />
          <SearchInput param="entityId" label="Record ID" showLabel />
          <DateRangeFilter label="Date" />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "actor", label: "Person" },
            { param: "action", label: "Action" },
            { param: "entity", label: "Record type", options: entityOptions },
            { param: "entityId", label: "Record ID" },
            { param: "org", label: "Organisation", options: f.org ? [{ value: f.org, label: orgName ?? "Unknown organisation" }] : [] },
            { param: "from", label: "From", kind: "date" },
            { param: "to", label: "To", kind: "date" },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Audit trail"
            rows={result.items}
            getRowId={(r) => String(r.id)}
            columns={[
              { id: "when", header: "When", nowrap: true, cell: (r) => <DateText value={r.occurredAt} mode="datetime" timeZone={tz} /> },
              {
                id: "action",
                header: "Action",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <code className="text-sm font-medium text-foreground">{r.action}</code>
                    {r.entityType ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {humanize(r.entityType)}
                        {r.entityId ? ` · ${r.entityId}` : ""}
                      </p>
                    ) : null}
                  </div>
                ),
              },
              {
                id: "actor",
                header: "By",
                cell: (r) => (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <PersonLink id={r.actorUserId} name={r.actorName} fallback={humanize(r.actorType)} canOpen={canUsers} />
                    {r.actorUserId ? <StatusBadge size="sm" tone={r.actorType === "staff" ? "brand" : "neutral"}>{humanize(r.actorType)}</StatusBadge> : null}
                  </span>
                ),
              },
              { id: "org", header: "Organisation", hideOnMobile: true, cell: (r) => r.organizationName ?? <span className="text-muted-foreground">—</span> },
              { id: "details", header: "Details", cell: (r) => <MetadataDetails metadata={r.metadata} extra={{ "Request ID": r.requestId, Browser: r.userAgent }} /> },
            ]}
            empty={<EmptyState icon={<ScrollText />} title="No entries match" description="Try a wider date range or fewer filters." />}
            footer={<Pagination pathname="/admin/audit" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="entries" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
