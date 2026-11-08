import { inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { applications, jobs, organizations, users } from "@/db/schema";
import { formatExportDateTime } from "@/lib/xlsx-export";
import { EXPORT_FETCH_LIMIT, staffExport } from "@/modules/exports/http";
import { applicationRemarks, candidatePeople, EMPTY_PERSON, type PersonColumns } from "@/modules/exports/people";
import type { ApplicationListItem } from "@/modules/recruitment/application-queries";
import { DEFAULT_WORKFLOW } from "@/modules/recruitment/default-workflow";
import { listApplicationsForStaff } from "@/modules/recruitment/queries";

import { isUuid, pickEnum } from "../_shared/server";

const SOURCES = ["direct", "staff_assigned", "partner", "referral", "campus", "import"] as const;
const STATUSES = ["active", "hired", "rejected", "withdrawn", "closed"] as const;
const SOURCE_LABELS: Record<string, string> = { direct: "Direct", staff_assigned: "Venkat Sai", partner: "Partner", referral: "Referral", campus: "Campus", import: "Import" };

type Row = ApplicationListItem & { person: PersonColumns; coverLetter: string | null; remarks: string };

/**
 * GET /admin/pipeline/export?<pipeline filters> — Excel download of applications (recruitment.view or .manage).
 * Also used for per-job lists (`?job=<id>`) and requirement lists (`?requirement=<id>`).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const get = (k: string) => p.get(k) ?? undefined;
  const uuid = (k: string) => (isUuid(get(k)) ? get(k) : undefined);
  const stageKeys = DEFAULT_WORKFLOW.stages.map((s) => s.key);
  const filters = {
    requirementId: uuid("requirement"),
    jobId: uuid("job"),
    partnerOrganizationId: uuid("partner"),
    assignedToUserId: uuid("owner"),
    stageKey: pickEnum(get("stage"), stageKeys),
    status: pickEnum(get("status"), STATUSES),
    source: pickEnum(get("source"), SOURCES),
    sharedWithEmployer: get("shared") === "no" ? false : get("shared") === "yes" ? true : undefined,
    q: get("q")?.slice(0, 100),
  };
  return staffExport<Row>({
    permission: ["recruitment.view", "recruitment.manage"],
    mode: "any",
    list: "applications",
    slug: filters.jobId ? "job-applications" : "pipeline",
    dataCategory: "contact",
    build: async (ctx) => {
      const result = await listApplicationsForStaff(ctx, filters, { page: 1, pageSize: EXPORT_FETCH_LIMIT, offset: 0 });
      const ids = result.items.map((a) => a.id);
      const [people, remarks, letters, names] = await Promise.all([
        candidatePeople(ctx, result.items.map((a) => a.candidate.id)),
        applicationRemarks(ids),
        ids.length ? db.select({ id: applications.id, coverLetter: applications.coverLetter }).from(applications).where(inArray(applications.id, ids)) : Promise.resolve([]),
        lookupNames(filters),
      ]);
      const letterById = new Map(letters.map((l) => [l.id, l.coverLetter]));
      const stage = filters.stageKey ? DEFAULT_WORKFLOW.stages.find((s) => s.key === filters.stageKey)?.name : null;
      const labels = [
        names.job ? `Job: ${names.job}` : null,
        filters.requirementId ? "Requirement: selected requirement" : null,
        names.partner ? `Partner: ${names.partner}` : null,
        names.owner ? `Owner: ${names.owner}` : null,
        stage ? `Stage: ${stage}` : null,
        filters.status ? `Status: ${filters.status}` : null,
        filters.source ? `Source: ${SOURCE_LABELS[filters.source]}` : null,
        filters.sharedWithEmployer !== undefined ? `Shared with employer: ${filters.sharedWithEmployer ? "yes" : "no"}` : null,
        filters.q ? `Search: "${filters.q}"` : null,
      ].filter((v): v is string => Boolean(v));
      return {
        title: names.job ? `Applications for ${names.job}` : "Pipeline (applications)",
        filters: labels,
        filterValues: filters,
        total: result.total,
        rows: result.items.map((a) => ({ ...a, person: people.get(a.candidate.id) ?? { ...EMPTY_PERSON, name: a.candidate.displayName }, coverLetter: letterById.get(a.id) ?? null, remarks: remarks.get(a.id) ?? "" })),
        columns: [
          { header: "Name", value: (r) => r.person.name || r.candidate.displayName },
          { header: "Trade", value: (r) => r.person.trade },
          { header: "Passport No", value: (r) => r.person.passport },
          { header: "Phone number(s)", value: (r) => r.person.phone },
          { header: "Candidate notes", value: (r) => r.coverLetter?.trim() || r.person.candidateNotes, wrap: true },
          { header: "Staff remarks", value: (r) => [r.remarks, r.person.staffRemarks].filter(Boolean).join(" | "), wrap: true },
          { header: "Job / requirement", value: (r) => `${r.job.title} (${r.job.code})` },
          { header: "Employer", value: (r) => r.job.organizationName ?? "Venkat Sai" },
          { header: "Stage", value: (r) => r.stage.name },
          { header: "Status", value: (r) => r.status },
          { header: "Source", value: (r) => SOURCE_LABELS[r.source] ?? r.source },
          { header: "Partner", value: (r) => r.partnerName ?? "" },
          { header: "Owner", value: (r) => r.assignedToName ?? "" },
          { header: "Application", value: (r) => r.code },
          { header: "Applied", value: (r) => formatExportDateTime(r.createdAt) },
        ],
      };
    },
  });
}

async function lookupNames(filters: { jobId?: string; partnerOrganizationId?: string; assignedToUserId?: string }): Promise<{ job: string | null; partner: string | null; owner: string | null }> {
  const [job, partner, owner] = await Promise.all([
    filters.jobId ? db.select({ title: jobs.title, code: jobs.code }).from(jobs).where(inArray(jobs.id, [filters.jobId])).limit(1) : Promise.resolve([]),
    filters.partnerOrganizationId ? db.select({ name: organizations.name }).from(organizations).where(inArray(organizations.id, [filters.partnerOrganizationId])).limit(1) : Promise.resolve([]),
    filters.assignedToUserId ? db.select({ name: users.displayName }).from(users).where(inArray(users.id, [filters.assignedToUserId])).limit(1) : Promise.resolve([]),
  ]);
  return { job: job[0] ? `${job[0].title} (${job[0].code})` : null, partner: partner[0]?.name ?? null, owner: owner[0]?.name ?? null };
}
