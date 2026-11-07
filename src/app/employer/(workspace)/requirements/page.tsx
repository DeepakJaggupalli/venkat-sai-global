import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { RequirementStatusBadge } from "@/components/employer/requirement-status-badge";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { env } from "@/lib/env";
import { parsePage, sp as readParam, type SearchParams } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { REQUIREMENT_KIND_LABELS, REQUIREMENT_STATUS_VALUES, REQUIREMENT_URGENCY_LABELS } from "@/modules/operations/constants";
import { listOrgRequirements } from "@/modules/operations/queries";
import type { EmployerRequirementListItem } from "@/modules/operations/types";

export const metadata: Metadata = { title: "Workforce requirements" };

type StatusFilter = (typeof REQUIREMENT_STATUS_VALUES)[number] | "open" | undefined;

export default async function EmployerRequirementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  const sp = await searchParams;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const raw = readParam(sp, "status") ?? "open";
  const status: StatusFilter = raw === "all" ? undefined : raw === "open" ? "open" : (REQUIREMENT_STATUS_VALUES as readonly string[]).includes(raw) ? (raw as StatusFilter) : "open";
  const page = parsePage(sp, { defaultSize: 20, maxSize: 50 });
  const result = await listOrgRequirements(ctx, { status }, page);
  const activeHref = raw === "all" ? "/employer/requirements?status=all" : status === "open" ? "/employer/requirements" : `/employer/requirements?status=${status}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workforce requirements"
        description="Tell Venkat Sai how many people you need, for which trades and by when. Our team sources, screens and tests candidates for you."
        actions={[{ label: "New requirement", href: "/employer/requirements/new" }]}
      />
      <LinkTabs
        label="Requirement status"
        activeHref={activeHref}
        items={[
          { href: "/employer/requirements", label: "Open" },
          { href: "/employer/requirements?status=draft", label: "Drafts" },
          { href: "/employer/requirements?status=filled", label: "Filled" },
          { href: "/employer/requirements?status=cancelled", label: "Cancelled" },
          { href: "/employer/requirements?status=all", label: "All" },
        ]}
      />
      <DataTable<EmployerRequirementListItem>
        caption="Workforce requirements"
        rows={result.items}
        getRowId={(r) => r.id}
        rowLink={(r) => ({ href: `/employer/requirements/${r.id}`, label: `Open ${r.title}` })}
        columns={[
          {
            id: "title",
            header: "Requirement",
            primary: true,
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.code} · {REQUIREMENT_KIND_LABELS[r.kind]}
                </p>
              </div>
            ),
          },
          { id: "status", header: "Status", cell: (r) => <RequirementStatusBadge status={r.status} /> },
          { id: "positions", header: "Positions", align: "right", cell: (r) => r.totalPositions },
          { id: "urgency", header: "Urgency", hideOnMobile: true, cell: (r) => REQUIREMENT_URGENCY_LABELS[r.urgency] },
          { id: "joining", header: "Joining by", hideOnMobile: true, nowrap: true, cell: (r) => (r.joiningBy ? <DateText value={r.joiningBy} dateOnly /> : "—") },
          { id: "submitted", header: "Submitted", hideOnMobile: true, nowrap: true, cell: (r) => (r.submittedAt ? <DateText value={r.submittedAt} timeZone={timeZone} /> : "Not yet") },
        ]}
        empty={
          <EmptyState
            icon={<ClipboardList aria-hidden="true" />}
            title={status === "open" ? "No open requirements" : "Nothing here"}
            description={status === "open" ? "Send your first requirement: list the trades, positions and joining date, and Venkat Sai will get back to you." : "Requirements with this status appear here."}
            primaryAction={{ label: "New requirement", href: "/employer/requirements/new" }}
          />
        }
        footer={
          result.pageCount > 1 ? (
            <Pagination pathname="/employer/requirements" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="requirements" />
          ) : undefined
        }
      />
    </div>
  );
}
