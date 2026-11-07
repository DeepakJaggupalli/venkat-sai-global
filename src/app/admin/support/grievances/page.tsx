import type { Metadata } from "next";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { GRIEVANCE_TYPE_LABELS } from "@/modules/operations/constants";
import { listTickets } from "@/modules/operations/queries";
import { STATUTORY_GRIEVANCE_RESOLUTION_HOURS } from "@/modules/operations/sla";
import { getSettings } from "@/modules/settings";

import { SlaBadge } from "../_components/sla-badge";

export const metadata: Metadata = { title: "Grievance register" };

const BASE = "/admin/support/grievances";

/**
 * Grievance register: every formal grievance with its acknowledgement and resolution deadlines. The
 * timelines shown come from settings (privacy.grievance_*) and the statutory overrides in the SLA rules.
 */
export default async function GrievancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff(["support.view", "support.grievances"]);
  const params = await searchParams;
  const view = sp(params, "view") === "closed" ? "closed" : sp(params, "view") === "all" ? undefined : "open";
  const page = parsePage(params, { defaultSize: 25, maxSize: 100 });
  const [result, settings] = await Promise.all([
    listTickets(ctx, { grievance: true, status: view }, page),
    getSettings(["privacy.grievance_ack_hours", "privacy.grievance_resolution_days"]),
  ]);
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Support desk", href: "/admin/support" }, { label: "Grievance register" }]} />
      <PageHeader title="Grievance register" description="Formal grievances and their statutory timelines." backLink={{ href: "/admin/support", label: "Back to support desk" }} />
      <SectionCard title="Timelines in force" headingLevel="h2">
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>
            Acknowledgement: within <strong className="text-foreground">{String(settings["privacy.grievance_ack_hours"])} hours</strong> (or the shorter priority deadline)
          </li>
          <li>
            Resolution: within <strong className="text-foreground">{String(settings["privacy.grievance_resolution_days"])} days</strong>
          </li>
          {Object.entries(STATUTORY_GRIEVANCE_RESOLUTION_HOURS).map(([type, hours]) => (
            <li key={type}>
              {GRIEVANCE_TYPE_LABELS[type as keyof typeof GRIEVANCE_TYPE_LABELS]}: resolution within <strong className="text-foreground">{hours} hours</strong>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Change the configurable timelines in Settings → Privacy.</p>
      </SectionCard>
      <LinkTabs
        label="Grievance status"
        items={[
          { href: BASE, label: "Open", match: "exact" },
          { href: `${BASE}?view=closed`, label: "Resolved and closed" },
          { href: `${BASE}?view=all`, label: "All" },
        ]}
        activeHref={view === "closed" ? `${BASE}?view=closed` : view === undefined ? `${BASE}?view=all` : BASE}
      />
      <DataTable
        caption="Grievances"
        rows={result.items}
        getRowId={(t) => t.id}
        rowLink={(t) => ({ href: `/admin/support/${t.id}`, label: `Open grievance ${t.grievanceCode ?? t.code}` })}
        columns={[
          {
            id: "grievance",
            header: "Grievance",
            primary: true,
            cell: (t) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {t.grievanceCode ?? "No register code"} · {t.code} · {t.requesterName ?? "Unknown"}
                </p>
              </div>
            ),
          },
          { id: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} domain="ticket" size="sm" /> },
          {
            id: "ack",
            header: "Acknowledgement",
            cell: (t) => (
              <span className="flex flex-col gap-1">
                <SlaBadge state={t.sla.firstResponse} />
                {t.firstResponseDueAt ? <DateText value={t.firstResponseDueAt} mode="datetime" timeZone={timeZone} className="text-xs text-muted-foreground" /> : null}
              </span>
            ),
          },
          {
            id: "resolution",
            header: "Resolution",
            cell: (t) => (
              <span className="flex flex-col gap-1">
                <SlaBadge state={t.sla.resolution} />
                {t.resolutionDueAt ? <DateText value={t.resolutionDueAt} mode="datetime" timeZone={timeZone} className="text-xs text-muted-foreground" /> : null}
              </span>
            ),
          },
          { id: "escalation", header: "Escalation", hideOnMobile: true, cell: (t) => (t.escalationLevel ? `Level ${t.escalationLevel}` : "—") },
          { id: "assignee", header: "Assignee", hideOnMobile: true, cell: (t) => t.assigneeName ?? "Unassigned" },
        ]}
        empty={<EmptyState title="No grievances in this view" description="Formal grievances appear here with their deadlines." />}
        footer={<Pagination pathname={BASE} searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="grievances" />}
      />
    </div>
  );
}
