import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { ASSIGNMENT_STATUS, daysUntil, labelOf } from "@/components/recruiter/labels";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { listAssignmentsForPartner } from "@/modules/recruitment/queries";
import { countryOptions } from "@/modules/taxonomy/queries";

import { sp } from "../../_lib/page-utils";

export const metadata: Metadata = { title: "Assigned requirements" };

const STATUS_VALUES = ["active", "paused", "completed", "revoked"] as const;
type AssignmentStatus = (typeof STATUS_VALUES)[number];

export default async function RecruiterRequirementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.requirements.view");
  const params = await searchParams;
  const rawStatus = sp(params, "status");
  const status = STATUS_VALUES.includes(rawStatus as AssignmentStatus) ? (rawStatus as AssignmentStatus) : undefined;
  const page = parsePage(params, { defaultSize: 20 });
  const [result, countries] = await Promise.all([listAssignmentsForPartner(ctx, { status }, page), countryOptions()]);
  const countryName = new Map(countries.map((c) => [c.value, c.label]));
  const verified = ctx.organization.status === "verified";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assigned requirements"
        description="Requirements Venkat Sai has assigned to your agency, with targets, submission limits and your commission terms. You only see what is assigned to you."
      />
      {!verified ? (
        <Callout tone="info" title="Verification needed to submit candidates" action={{ label: "Go to verification", href: "/recruiter/profile/verification" }}>
          Venkat Sai assigns requirements to verified agencies only.
        </Callout>
      ) : null}

      <FilterBar paramKeys={["status"]} label="Filter requirements">
        <FilterSelect param="status" label="Status" allLabel="All statuses" options={STATUS_VALUES.map((v) => ({ value: v, label: ASSIGNMENT_STATUS[v]!.label }))} />
      </FilterBar>

      <DataTable
        caption="Requirements assigned to your agency"
        rows={result.items}
        getRowId={(a) => a.id}
        rowLink={(a) => ({ href: `/recruiter/requirements/${a.id}`, label: `Open ${a.title}` })}
        columns={[
          {
            id: "title",
            header: "Requirement",
            primary: true,
            cell: (a) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{a.title || "Untitled requirement"}</p>
                <p className="text-xs text-muted-foreground">{a.requirement?.code ?? a.job?.code}</p>
              </div>
            ),
          },
          {
            id: "location",
            header: "Location",
            cell: (a) => {
              const cc = a.job?.countryCode ?? a.requirement?.countryCode;
              const place = a.job?.city ?? a.requirement?.locations;
              return [place, cc ? (countryName.get(cc) ?? cc) : null].filter(Boolean).join(", ") || "—";
            },
          },
          { id: "target", header: "Positions", align: "right", cell: (a) => a.positionsTarget ?? a.requirement?.totalPositions ?? "—" },
          {
            id: "submissions",
            header: "Submissions",
            align: "right",
            cell: (a) => (a.submissionLimit !== null ? `${a.submissionsUsed} of ${a.submissionLimit}` : a.submissionsUsed),
          },
          {
            id: "due",
            header: "Due",
            cell: (a) => {
              if (!a.dueDate) return "—";
              const days = daysUntil(a.dueDate);
              return (
                <span>
                  <DateText value={a.dueDate} dateOnly />
                  {a.status === "active" && days !== null && days >= 0 && days <= 7 ? <span className="block text-xs font-medium text-warning-strong">{days === 0 ? "Due today" : `${days} days left`}</span> : null}
                </span>
              );
            },
          },
          {
            id: "status",
            header: "Status",
            cell: (a) => {
              const s = labelOf(ASSIGNMENT_STATUS, a.status);
              return (
                <StatusBadge tone={s.tone} size="sm">
                  {s.label}
                </StatusBadge>
              );
            },
          },
        ]}
        empty={
          <EmptyState
            icon={<ClipboardList aria-hidden="true" />}
            title={status ? "No requirements with this status" : "No requirements assigned yet"}
            description={
              verified
                ? "When Venkat Sai assigns a requirement to your agency you will be notified and it will appear here."
                : "Complete your agency verification so Venkat Sai can start assigning requirements to you."
            }
            primaryAction={verified ? { label: "Review your territories", href: "/recruiter/profile#territories" } : { label: "Complete verification", href: "/recruiter/profile/verification" }}
          />
        }
        footer={
          result.pageCount > 1 ? (
            <Pagination pathname="/recruiter/requirements" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="requirements" />
          ) : null
        }
      />
    </div>
  );
}
