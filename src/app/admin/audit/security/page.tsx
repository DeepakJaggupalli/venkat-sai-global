import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

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
import { listSecurityEvents, securityEventTypes, securityFilterSchema } from "../_lib/queries";

export const metadata: Metadata = { title: "Security events" };

type SP = Record<string, string | string[] | undefined>;
const PARAMS = ["user", "type", "severity", "from", "to"] as const;
const severityOptions = [
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Information" },
];
const SEVERITY_TONE = { critical: "danger", warning: "warning", info: "neutral" } as const;

export default async function SecurityEventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("audit.view");
  const tz = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const sp = await searchParams;
  const f = securityFilterSchema.parse(Object.fromEntries(PARAMS.map((k) => [k, sp[k]])));
  const page = parsePage(sp, { defaultSize: 50, maxSize: 100 });
  const [result, types] = await Promise.all([listSecurityEvents(f, page, tz), securityEventTypes()]);
  const canUsers = staffCan(ctx, "users.view");
  const typeOptions = types.map((t) => ({ value: t, label: humanize(t) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security events"
        description="Sign-ins, failed attempts, lockouts, two-factor changes, session revocations and other account security signals."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Audit logs", href: "/admin/audit" }, { label: "Security events" }]}
        actions={<DownloadLink href={withParams("/admin/audit/export", sp, { log: "security", page: null })} label="Export CSV" />}
      />
      <AuditNav />
      <FilterScope>
        <FilterBar paramKeys={[...PARAMS]} search={<SearchInput param="user" label="Search by person (name, e-mail or account ID)" />}>
          <FilterSelect param="type" label="Event" allLabel="All events" options={typeOptions} />
          <FilterSelect param="severity" label="Severity" allLabel="Any severity" options={severityOptions} />
          <DateRangeFilter label="Date" />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "user", label: "Person" },
            { param: "type", label: "Event", options: typeOptions },
            { param: "severity", label: "Severity", options: severityOptions },
            { param: "from", label: "From", kind: "date" },
            { param: "to", label: "To", kind: "date" },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Security events"
            rows={result.items}
            getRowId={(r) => String(r.id)}
            columns={[
              { id: "when", header: "When", nowrap: true, cell: (r) => <DateText value={r.occurredAt} mode="datetime" timeZone={tz} /> },
              { id: "type", header: "Event", primary: true, cell: (r) => <span className="font-medium">{humanize(r.type)}</span> },
              { id: "severity", header: "Severity", cell: (r) => <StatusBadge tone={SEVERITY_TONE[r.severity]} size="sm">{humanize(r.severity)}</StatusBadge> },
              { id: "user", header: "Account", cell: (r) => <PersonLink id={r.userId} name={r.userName} fallback="No account" canOpen={canUsers} /> },
              { id: "details", header: "Details", cell: (r) => <MetadataDetails metadata={r.metadata} extra={{ Browser: r.userAgent }} /> },
            ]}
            empty={<EmptyState icon={<ShieldCheck />} title="No security events match" description="Try a wider date range or fewer filters." />}
            footer={<Pagination pathname="/admin/audit/security" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="events" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
