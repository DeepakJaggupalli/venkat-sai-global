import "server-only";

import { and, count, eq, gte, isNotNull, isNull, lt, min, ne, type SQL } from "drizzle-orm";

import type { StageReachRow } from "@/components/employer-talent/report-utils";
import { db } from "@/db";
import { applicationStageHistory, applications, interviewFeedback, interviews, jobs, placements, workflowStages } from "@/db/schema";
import type { SearchParams } from "@/lib/http";
import type { OrgContext } from "@/modules/identity/authz";

/**
 * Recruitment report reads for the Employer Portal (local: the recruitment module has no reporting
 * API yet). Every query is scoped to the caller's organisation and to applications shared with it;
 * partner identity is never selected.
 */

export type ReportFilters = { from?: Date; to?: Date; fromIso?: string; toIso?: string; jobId?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReportFilters(sp: SearchParams): ReportFilters {
  const from = typeof sp.from === "string" && ISO_DATE.test(sp.from) ? sp.from : undefined;
  const to = typeof sp.to === "string" && ISO_DATE.test(sp.to) ? sp.to : undefined;
  const jobId = typeof sp.jobId === "string" && UUID.test(sp.jobId) ? sp.jobId : undefined;
  const toDate = to ? new Date(`${to}T00:00:00Z`) : undefined;
  if (toDate) toDate.setUTCDate(toDate.getUTCDate() + 1); // inclusive end date
  return { from: from ? new Date(`${from}T00:00:00Z`) : undefined, to: toDate, fromIso: from, toIso: to, jobId };
}

function range(column: Parameters<typeof gte>[0], f: ReportFilters): SQL[] {
  const out: SQL[] = [];
  if (f.from) out.push(gte(column, f.from));
  if (f.to) out.push(lt(column, f.to));
  return out;
}

export type ReportJob = { id: string; code: string; title: string; status: string; publishedAt: Date | null; openings: number };

export type ReportData = {
  jobs: ReportJob[];
  reach: StageReachRow[];
  firstPlacementByJob: Record<string, Date>;
  hireDays: number[];
  hireSources: { source: string; value: number }[];
  interviewStatus: { status: string; outcome: string; value: number }[];
  recommendations: { recommendation: string; value: number }[];
};

export async function loadReportData(ctx: OrgContext<"employer">, f: ReportFilters): Promise<ReportData> {
  const orgId = ctx.organization.id;
  const jobScope = and(eq(jobs.organizationId, orgId), isNull(jobs.deletedAt), f.jobId ? eq(jobs.id, f.jobId) : undefined);
  const appScope = and(jobScope, isNotNull(applications.sharedWithEmployerAt), ...range(applications.createdAt, f));
  const placementScope = and(eq(placements.organizationId, orgId), ne(placements.status, "cancelled"), f.jobId ? eq(placements.jobId, f.jobId) : undefined, ...range(placements.createdAt, f));

  const [jobRows, historyReach, currentReach, firstPlacements, hires, sources, interviewRows, recommendationRows] = await Promise.all([
    db
      .select({ id: jobs.id, code: jobs.code, title: jobs.title, status: jobs.status, publishedAt: jobs.publishedAt, openings: jobs.openings })
      .from(jobs)
      .where(and(jobScope, isNotNull(jobs.publishedAt)))
      .limit(500),
    db
      .selectDistinct({ jobId: applications.jobId, applicationId: applications.id, category: workflowStages.category })
      .from(applicationStageHistory)
      .innerJoin(applications, eq(applications.id, applicationStageHistory.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(workflowStages, eq(workflowStages.id, applicationStageHistory.toStageId))
      .where(appScope)
      .limit(50_000),
    db
      .select({ jobId: applications.jobId, applicationId: applications.id, category: workflowStages.category })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .where(appScope)
      .limit(20_000),
    db
      .select({ jobId: placements.jobId, first: min(placements.createdAt) })
      .from(placements)
      .where(and(eq(placements.organizationId, orgId), ne(placements.status, "cancelled"), f.jobId ? eq(placements.jobId, f.jobId) : undefined))
      .groupBy(placements.jobId),
    db
      .select({ appliedAt: applications.createdAt, placedAt: placements.createdAt })
      .from(placements)
      .innerJoin(applications, eq(applications.id, placements.applicationId))
      .where(placementScope)
      .limit(5_000),
    db.select({ source: applications.source, value: count() }).from(placements).innerJoin(applications, eq(applications.id, placements.applicationId)).where(placementScope).groupBy(applications.source),
    db
      .select({ status: interviews.status, outcome: interviews.outcome, value: count() })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(jobScope, isNotNull(applications.sharedWithEmployerAt), ...range(interviews.scheduledStart, f)))
      .groupBy(interviews.status, interviews.outcome),
    db
      .select({ recommendation: interviewFeedback.recommendation, value: count() })
      .from(interviewFeedback)
      .innerJoin(interviews, eq(interviews.id, interviewFeedback.interviewId))
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(jobScope, eq(interviewFeedback.authorOrganizationId, orgId), ...range(interviews.scheduledStart, f)))
      .groupBy(interviewFeedback.recommendation),
  ]);

  const firstPlacementByJob: Record<string, Date> = {};
  for (const r of firstPlacements) if (r.first) firstPlacementByJob[r.jobId] = new Date(r.first);

  return {
    jobs: jobRows,
    reach: [...historyReach, ...currentReach],
    firstPlacementByJob,
    hireDays: hires.map((h) => Math.max(0, Math.round((new Date(h.placedAt).getTime() - new Date(h.appliedAt).getTime()) / 86_400_000))),
    hireSources: sources.map((s) => ({ source: s.source, value: Number(s.value) })),
    interviewStatus: interviewRows.map((r) => ({ status: r.status, outcome: r.outcome, value: Number(r.value) })),
    recommendations: recommendationRows.map((r) => ({ recommendation: r.recommendation, value: Number(r.value) })),
  };
}

/** Job options for the report filter (the organisation's published jobs). */
export async function reportJobOptions(ctx: OrgContext<"employer">): Promise<{ value: string; label: string }[]> {
  const rows = await db
    .select({ id: jobs.id, title: jobs.title, code: jobs.code })
    .from(jobs)
    .where(and(eq(jobs.organizationId, ctx.organization.id), isNull(jobs.deletedAt), isNotNull(jobs.publishedAt)))
    .limit(300);
  return rows.map((r) => ({ value: r.id, label: `${r.title} (${r.code})` }));
}

