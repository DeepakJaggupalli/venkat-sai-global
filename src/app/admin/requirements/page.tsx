import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, KanbanSquare, Table2 } from "lucide-react";
import { z } from "zod";

import { listStaffOptions } from "@/components/admin/queries";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { REQUIREMENT_SOURCE_LABELS, REQUIREMENT_STATUS_LABELS, REQUIREMENT_URGENCY_LABELS } from "@/modules/operations/constants";
import { listRequirements, requirementStatusCounts, type RequirementListItem } from "@/modules/operations/queries";
import type { RequirementStatus } from "@/modules/operations/types";
import { countryOptions } from "@/modules/taxonomy/queries";

import { URGENCY_TONE } from "./_lib/tones";

export const metadata: Metadata = { title: "Requirements" };

type SP = Record<string, string | string[] | undefined>;
const opts = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

const BOARD_COLUMNS: RequirementStatus[] = ["submitted", "under_review", "approved", "sourcing", "in_progress", "partially_filled", "on_hold", "filled"];

const filtersSchema = z.object({
  view: z.enum(["table", "board"]).catch("table").default("table"),
  status: z.enum([...(Object.keys(REQUIREMENT_STATUS_LABELS) as [RequirementStatus]), "open"]).optional().catch(undefined),
  urgency: z.enum(Object.keys(REQUIREMENT_URGENCY_LABELS) as [keyof typeof REQUIREMENT_URGENCY_LABELS]).optional().catch(undefined),
  source: z.enum(Object.keys(REQUIREMENT_SOURCE_LABELS) as [keyof typeof REQUIREMENT_SOURCE_LABELS]).optional().catch(undefined),
  assignee: z.string().max(40).optional().catch(undefined),
  country: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("requirements.view");
  const sp = await searchParams;
  const f = filtersSchema.parse({ view: sp.view, status: sp.status, urgency: sp.urgency, source: sp.source, assignee: sp.assignee, country: sp.country, q: sp.q });
  const board = f.view === "board";
  const page = board ? { page: 1, pageSize: 300, offset: 0 } : parsePage(sp, { defaultSize: 25 });
  const assignedTo = f.assignee === "me" ? ctx.user.id : f.assignee === "unassigned" ? "unassigned" : f.assignee && z.uuid().safeParse(f.assignee).success ? f.assignee : undefined;

  const [result, counts, staff, countries] = await Promise.all([
    listRequirements(ctx, { status: board ? "open" : (f.status ?? "open"), urgency: f.urgency, source: f.source, assignedTo, countryCode: f.country, q: f.q }, page),
    requirementStatusCounts(ctx),
    listStaffOptions({ permission: "requirements.view" }),
    countryOptions(),
  ]);
  const assigneeOptions = [{ value: "me", label: "Owned by me" }, { value: "unassigned", label: "No owner" }, ...staff];
  const statusOptions = [{ value: "open", label: "All open" }, ...opts(REQUIREMENT_STATUS_LABELS)];
  const awaiting = (counts.submitted ?? 0) + (counts.under_review ?? 0);
  const viewHref = (v: "table" | "board") => {
    const usp = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string" && k !== "view" && k !== "page") usp.set(k, val);
    if (v === "board") usp.set("view", "board");
    const qs = usp.toString();
    return `/admin/requirements${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workforce requirements"
        description="Manpower requests from employers and the website. Approve them in the approval centre, then deliver role by role."
        meta={<span className="text-sm text-muted-foreground">{awaiting} awaiting review</span>}
      />
      <LinkTabs
        label="Requirement views"
        items={[
          { href: viewHref("table"), label: "Table", icon: <Table2 />, match: "exact" },
          { href: viewHref("board"), label: "Pipeline board", icon: <KanbanSquare />, match: "exact" },
        ]}
        activeHref={viewHref(f.view)}
      />
      <FilterScope>
        <FilterBar paramKeys={["q", "status", "urgency", "source", "assignee", "country"]} search={<SearchInput label="Search requirements by title, company, email or code" />}>
          {board ? null : <FilterSelect param="status" label="Status" allLabel="All open" options={statusOptions} />}
          <FilterSelect param="urgency" label="Urgency" allLabel="Any urgency" options={opts(REQUIREMENT_URGENCY_LABELS)} />
          <FilterSelect param="source" label="Source" allLabel="All sources" options={opts(REQUIREMENT_SOURCE_LABELS)} />
          <FilterSelect param="assignee" label="Owner" allLabel="Anyone" options={assigneeOptions} />
          <FilterSelect param="country" label="Country" allLabel="All countries" options={countries} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            { param: "urgency", label: "Urgency", options: opts(REQUIREMENT_URGENCY_LABELS) },
            { param: "source", label: "Source", options: opts(REQUIREMENT_SOURCE_LABELS) },
            { param: "assignee", label: "Owner", options: assigneeOptions },
            { param: "country", label: "Country", options: countries },
          ]}
        />
        <FilterPendingRegion>
          {board ? (
            <RequirementBoard items={result.items} total={result.total} />
          ) : (
            <DataTable
              caption="Workforce requirements"
              rows={result.items}
              getRowId={(r) => r.id}
              rowLink={(r) => ({ href: `/admin/requirements/${r.id}`, label: `Open ${r.code}: ${r.title}` })}
              columns={[
                {
                  id: "title",
                  header: "Requirement",
                  primary: true,
                  cell: (r) => (
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.code} · {r.organizationName ?? "Company not given"}
                        {r.countryCode ? ` · ${r.countryCode}` : ""}
                      </p>
                    </div>
                  ),
                },
                { id: "positions", header: "Positions", align: "right", cell: (r) => r.totalPositions },
                { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} size="sm">{REQUIREMENT_STATUS_LABELS[r.status]}</StatusBadge> },
                { id: "urgency", header: "Urgency", cell: (r) => <StatusBadge tone={URGENCY_TONE[r.urgency]} size="sm">{REQUIREMENT_URGENCY_LABELS[r.urgency]}</StatusBadge> },
                { id: "owner", header: "Owner", hideOnMobile: true, cell: (r) => r.assigneeName ?? <span className="text-muted-foreground">No owner</span> },
                { id: "joining", header: "Joining by", hideOnMobile: true, cell: (r) => (r.joiningBy ? <DateText value={r.joiningBy} dateOnly /> : <span className="text-muted-foreground">Not set</span>) },
                { id: "submitted", header: "Submitted", nowrap: true, cell: (r) => (r.submittedAt ? <RelativeTime value={r.submittedAt} /> : <span className="text-muted-foreground">Draft</span>) },
              ]}
              empty={<EmptyState icon={<HardHat />} title="No requirements match" description="Requirements arrive from the Employer Portal and the public “Post a requirement” form." />}
              footer={<Pagination pathname="/admin/requirements" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="requirements" />}
            />
          )}
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}

/** Read-only pipeline board grouped by status. Status changes happen on the detail page (rules and reasons apply). */
function RequirementBoard({ items, total }: { items: RequirementListItem[]; total: number }) {
  if (!items.length) return <EmptyState icon={<HardHat />} title="No open requirements" description="Open requirements appear here grouped by stage." />;
  return (
    <div className="space-y-2">
      {total > items.length ? <p className="text-sm text-muted-foreground">Showing the {items.length} most recent of {total}. Narrow the filters to see the rest.</p> : null}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <ol className="flex min-w-max gap-3" aria-label="Requirement pipeline">
          {BOARD_COLUMNS.map((status) => {
            const col = items.filter((i) => i.status === status);
            return (
              <li key={status} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface-subtle/70">
                <h2 className="flex items-center justify-between px-3 py-2.5 font-heading text-sm font-semibold">
                  {REQUIREMENT_STATUS_LABELS[status]}
                  <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">{col.length}</span>
                </h2>
                <ul className="flex flex-col gap-2 px-2 pb-2">
                  {col.length ? (
                    col.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/admin/requirements/${r.id}`}
                          className="block rounded-lg border border-border bg-card p-3 shadow-xs transition-colors hover:border-teal/40 focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <span className="block text-sm font-medium text-foreground">{r.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {r.code} · {r.organizationName ?? "Company not given"}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                            <StatusBadge tone={URGENCY_TONE[r.urgency]} size="sm">
                              {REQUIREMENT_URGENCY_LABELS[r.urgency]}
                            </StatusBadge>
                            <span className="text-muted-foreground">{r.totalPositions} positions</span>
                            {r.assigneeName ? <span className="text-muted-foreground">· {r.assigneeName}</span> : null}
                          </span>
                        </Link>
                      </li>
                    ))
                  ) : (
                    <li className="px-1 py-3 text-xs text-muted-foreground">None</li>
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
