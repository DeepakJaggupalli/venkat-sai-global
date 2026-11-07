import type { Metadata } from "next";

import { listStaffOptions } from "@/components/admin/queries";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { formatDate } from "@/lib/format";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { REJECTION_REASON_LABELS, REJECTION_REASON_OPTIONS } from "@/modules/recruitment/constants";
import { DEFAULT_WORKFLOW } from "@/modules/recruitment/default-workflow";
import { listApplicationsForStaff } from "@/modules/recruitment/queries";
import { PIPELINE_COLUMNS, pipelineColumnForStage } from "@/modules/recruitment/workflow";

import { boardMoveAction, bulkMoveAction, bulkShareAction } from "./actions";
import { PipelineBoard, type BoardCard } from "./_components/pipeline-board";
import { PipelineTable, type PipelineRow } from "./_components/pipeline-table";
import { jobFilterOptions, partnerOptions, requirementOptions } from "./_shared/options";
import { isUuid, pickEnum, staffTimeZone } from "./_shared/server";

export const metadata: Metadata = { title: "Pipeline" };

const SOURCES = ["direct", "staff_assigned", "partner", "referral", "campus", "import"] as const;
const STATUSES = ["active", "hired", "rejected", "withdrawn", "closed"] as const;

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["recruitment.view", "recruitment.manage"], "any");
  const params = await searchParams;
  const view = sp(params, "view") === "board" ? "board" : "table";
  const uuidParam = (key: string) => {
    const v = sp(params, key);
    return isUuid(v) ? v : undefined;
  };
  const stageKeys = DEFAULT_WORKFLOW.stages.map((s) => s.key);
  const filters = {
    requirementId: uuidParam("requirement"),
    jobId: uuidParam("job"),
    partnerOrganizationId: uuidParam("partner"),
    assignedToUserId: uuidParam("owner"),
    stageKey: pickEnum(sp(params, "stage"), stageKeys),
    status: pickEnum(sp(params, "status"), STATUSES) ?? (sp(params, "status") === "all" ? undefined : view === "board" ? "active" : undefined),
    source: pickEnum(sp(params, "source"), SOURCES),
    sharedWithEmployer: sp(params, "shared") === "no" ? false : sp(params, "shared") === "yes" ? true : undefined,
    q: sp(params, "q")?.slice(0, 100),
  };
  const page = view === "board" ? { page: 1, pageSize: 200, offset: 0 } : parsePage(params, { defaultSize: 25 });
  const [result, requirements, jobs, partners, owners] = await Promise.all([
    listApplicationsForStaff(staff, filters, page),
    requirementOptions({ includeIds: filters.requirementId ? [filters.requirementId] : [] }),
    jobFilterOptions(),
    partnerOptions(),
    listStaffOptions({ permission: "recruitment.manage" }),
  ]);
  const tz = staffTimeZone(staff);
  const canManage = staffCan(staff, "recruitment.manage");

  const stageOptions = DEFAULT_WORKFLOW.stages.filter((s) => s.key !== "withdrawn" && s.key !== "offer_accepted").map((s) => ({ value: s.key, label: s.name }));
  const rejectionOptions = REJECTION_REASON_OPTIONS.map((v) => ({ value: v, label: REJECTION_REASON_LABELS[v] }));
  const sourceOptions = SOURCES.map((s) => ({ value: s, label: s === "direct" ? "Direct" : s === "staff_assigned" ? "Venkat Sai" : s.charAt(0).toUpperCase() + s.slice(1) }));
  const statusOptions = [...STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })), { value: "all", label: "All, including closed" }];

  const rows: PipelineRow[] = result.items.map((a) => ({
    id: a.id,
    code: a.code,
    candidateId: a.candidate.id,
    candidateName: a.candidate.displayName,
    jobTitle: a.job.title,
    jobCode: a.job.code,
    employer: a.job.organizationName ?? "Venkat Sai",
    stageName: a.stage.name,
    stageCategory: a.stage.category,
    source: a.source,
    partnerName: a.partnerName,
    ownerName: a.assignedToName,
    flags: a.knockoutFlagCount,
    shared: !!a.sharedWithEmployerAt,
    managed: a.job.managedByVenkatSai,
    updated: formatDate(a.lastStageChangedAt, { timeZone: tz }),
  }));
  const cards: BoardCard[] = result.items.map((a) => ({
    id: a.id,
    columnId: pipelineColumnForStage(a.stage),
    code: a.code,
    candidateName: a.candidate.displayName,
    jobTitle: a.job.title,
    employer: a.job.organizationName ?? "Venkat Sai",
    stageName: a.stage.name,
    partnerName: a.partnerName,
  }));
  const viewHref = (v: "board" | "table") => {
    const usp = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (typeof val === "string" && k !== "view" && k !== "page") usp.set(k, val);
    if (v === "board") usp.set("view", "board");
    const s = usp.toString();
    return `/admin/pipeline${s ? `?${s}` : ""}`;
  };
  const chipFilters = [
    { param: "requirement", label: "Requirement", options: requirements },
    { param: "job", label: "Job", options: jobs },
    { param: "stage", label: "Stage", options: stageOptions },
    { param: "partner", label: "Partner", options: partners },
    { param: "owner", label: "Owner", options: owners },
    { param: "source", label: "Source", options: sourceOptions },
    { param: "status", label: "Status", options: statusOptions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Every application across jobs and requirements. Filter, then move stages in bulk or share Venkat Sai-managed applications with the employer."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Pipeline" }]}
        actions={canManage ? [{ label: "Assign a candidate", href: "/admin/candidates", variant: "outline" }] : undefined}
      />
      <LinkTabs
        label="View"
        activeHref={viewHref(view)}
        items={[
          { href: viewHref("table"), label: "Table" },
          { href: viewHref("board"), label: "Board" },
        ]}
      />
      <FilterScope>
        <FilterBar paramKeys={["q", "requirement", "job", "stage", "partner", "owner", "source", "status", "shared"]} search={<SearchInput label="Search by application code or candidate" />}>
          <FilterSelect param="requirement" label="Requirement" allLabel="All requirements" options={requirements} />
          <FilterSelect param="job" label="Job" allLabel="All jobs" options={jobs} />
          {view === "table" ? <FilterSelect param="stage" label="Stage" allLabel="All stages" options={stageOptions} /> : null}
          <FilterSelect param="partner" label="Partner" allLabel="All partners" options={partners} />
          <FilterSelect param="owner" label="Owner" allLabel="Anyone" options={owners} />
          <FilterSelect param="source" label="Source" allLabel="All sources" options={sourceOptions} />
          <FilterSelect param="status" label="Status" allLabel={view === "board" ? "Active" : "Any status"} options={statusOptions} />
          <FilterSelect param="shared" label="Shared with employer" allLabel="Shared or not" options={[{ value: "yes", label: "Shared" }, { value: "no", label: "Not shared" }]} />
        </FilterBar>
        <FilterChips filters={chipFilters} />
        <FilterPendingRegion>
          {result.total === 0 ? (
            <EmptyState
              title="No applications match"
              description="Try different filters, or add candidates to a job from their profile."
              primaryAction={{ label: "Search candidates", href: "/admin/candidates" }}
            />
          ) : view === "board" ? (
            <div className="space-y-3">
              {result.total > result.items.length ? (
                <Callout tone="info" title={`Showing 200 of ${result.total} applications`}>
                  Narrow the board by requirement or job to see every card.
                </Callout>
              ) : null}
              <PipelineBoard columns={PIPELINE_COLUMNS.map((c) => ({ id: c.key, title: c.label }))} items={cards} moveAction={boardMoveAction} canManage={canManage} />
            </div>
          ) : (
            <div className="space-y-3">
              <PipelineTable rows={rows} stageOptions={stageOptions} rejectionOptions={rejectionOptions} canManage={canManage} moveAction={bulkMoveAction} shareAction={bulkShareAction} />
              <Pagination pathname="/admin/pipeline" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="applications" />
            </div>
          )}
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
