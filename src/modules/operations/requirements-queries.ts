import "server-only";

import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { approvalRequests, jobs, leads, organizations, requirementRequests, users } from "@/db/schema";
import type { RequirementSource, RequirementStatus, RequirementUrgency } from "@/db/schema/operations";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { orgCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";

import { assertStaff, likePattern } from "./internal";
import { loadRequirementLines, type RequirementLineRow, type RequirementRow } from "./requirements";

const OPEN_STATUSES: RequirementStatus[] = ["submitted", "under_review", "approved", "sourcing", "in_progress", "partially_filled", "on_hold"];

export type RequirementListFilters = {
  status?: RequirementStatus | "open";
  urgency?: RequirementUrgency;
  source?: RequirementSource;
  /** "me", "unassigned" or a staff user id. */
  assignedTo?: string;
  organizationId?: string;
  countryCode?: string;
  q?: string;
};

export type RequirementListItem = Pick<
  RequirementRow,
  "id" | "code" | "title" | "kind" | "status" | "urgency" | "source" | "organizationId" | "organizationName" | "countryCode" | "totalPositions" | "joiningBy" | "submittedAt" | "createdAt" | "assignedToUserId"
> & { assigneeName: string | null };

export type RequirementLineView = RequirementLineRow & { jobTitle: string | null; jobCode: string | null; jobStatus: string | null };

export type StaffRequirementDetail = {
  requirement: Omit<RequirementRow, "searchVector" | "ipHash">;
  lines: RequirementLineView[];
  organization: { id: string; name: string; status: string } | null;
  lead: { id: string; code: string; status: string; name: string } | null;
  assigneeName: string | null;
  submittedByName: string | null;
  approval: { id: string; code: string; status: string; decisionReason: string | null; decidedAt: Date | null } | null;
};

/** What the employer sees: no internal notes, IP hash, lead or approval internals. */
export type EmployerRequirementView = Omit<RequirementRow, "searchVector" | "ipHash" | "internalNotes" | "leadId" | "assignedToUserId" | "approvalRequestId"> & {
  lines: RequirementLineView[];
};

async function linesWithJobs(requirementId: string): Promise<RequirementLineView[]> {
  const lines = await loadRequirementLines(requirementId);
  const jobIds = [...new Set(lines.map((l) => l.jobId).filter((id): id is string => Boolean(id)))];
  const jobRows = jobIds.length
    ? await db.select({ id: jobs.id, title: jobs.title, code: jobs.code, status: jobs.status }).from(jobs).where(and(inArray(jobs.id, jobIds), isNull(jobs.deletedAt)))
    : [];
  const byId = new Map(jobRows.map((j) => [j.id, j]));
  return lines.map((l) => {
    const job = l.jobId ? byId.get(l.jobId) : undefined;
    return { ...l, jobTitle: job?.title ?? null, jobCode: job?.code ?? null, jobStatus: job?.status ?? null };
  });
}

function stripStaffOnly(row: RequirementRow): Omit<RequirementRow, "searchVector" | "ipHash"> {
  const { searchVector: _sv, ipHash: _ip, ...rest } = row;
  void _sv;
  void _ip;
  return rest;
}

// ---------------------------------------------------------------------------
// Staff (requirements.view)
// ---------------------------------------------------------------------------

export async function listRequirements(ctx: StaffContext, filters: RequirementListFilters, page: PageQuery): Promise<Paginated<RequirementListItem>> {
  assertStaff(ctx, "requirements.view");
  const where: SQL[] = [];
  if (filters.status === "open") where.push(inArray(requirementRequests.status, OPEN_STATUSES));
  else if (filters.status) where.push(eq(requirementRequests.status, filters.status));
  if (filters.urgency) where.push(eq(requirementRequests.urgency, filters.urgency));
  if (filters.source) where.push(eq(requirementRequests.source, filters.source));
  if (filters.organizationId) where.push(eq(requirementRequests.organizationId, filters.organizationId));
  if (filters.countryCode) where.push(eq(requirementRequests.countryCode, filters.countryCode.toUpperCase()));
  if (filters.assignedTo === "me") where.push(eq(requirementRequests.assignedToUserId, ctx.user.id));
  else if (filters.assignedTo === "unassigned") where.push(isNull(requirementRequests.assignedToUserId));
  else if (filters.assignedTo) where.push(eq(requirementRequests.assignedToUserId, filters.assignedTo));
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.push(
      sql`(${requirementRequests.searchVector} @@ websearch_to_tsquery('simple', ${q}) or ${requirementRequests.code} ilike ${likePattern(q)} or ${requirementRequests.contactEmail} = ${q.toLowerCase()})`,
    );
  }
  const condition = where.length ? and(...where) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: requirementRequests.id,
        code: requirementRequests.code,
        title: requirementRequests.title,
        kind: requirementRequests.kind,
        status: requirementRequests.status,
        urgency: requirementRequests.urgency,
        source: requirementRequests.source,
        organizationId: requirementRequests.organizationId,
        organizationName: requirementRequests.organizationName,
        countryCode: requirementRequests.countryCode,
        totalPositions: requirementRequests.totalPositions,
        joiningBy: requirementRequests.joiningBy,
        submittedAt: requirementRequests.submittedAt,
        createdAt: requirementRequests.createdAt,
        assignedToUserId: requirementRequests.assignedToUserId,
        assigneeName: users.displayName,
      })
      .from(requirementRequests)
      .leftJoin(users, eq(users.id, requirementRequests.assignedToUserId))
      .where(condition)
      .orderBy(
        sql`case ${requirementRequests.urgency} when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
        desc(requirementRequests.submittedAt),
        desc(requirementRequests.createdAt),
      )
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(requirementRequests).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({ ...r, assigneeName: r.assigneeName ?? null })),
    totals[0]?.value ?? 0,
    page,
  );
}

export async function getRequirement(ctx: StaffContext, id: string): Promise<StaffRequirementDetail | null> {
  assertStaff(ctx, "requirements.view");
  const submitter = alias(users, "submitter");
  const [row] = await db
    .select({ requirement: requirementRequests, assigneeName: users.displayName, submittedByName: submitter.displayName })
    .from(requirementRequests)
    .leftJoin(users, eq(users.id, requirementRequests.assignedToUserId))
    .leftJoin(submitter, eq(submitter.id, requirementRequests.submittedByUserId))
    .where(eq(requirementRequests.id, id))
    .limit(1);
  if (!row) return null;
  const r = row.requirement;
  const [lines, org, lead, approval] = await Promise.all([
    linesWithJobs(id),
    r.organizationId
      ? db.select({ id: organizations.id, name: organizations.name, status: organizations.status }).from(organizations).where(eq(organizations.id, r.organizationId)).limit(1)
      : Promise.resolve([]),
    r.leadId ? db.select({ id: leads.id, code: leads.code, status: leads.status, name: leads.name }).from(leads).where(eq(leads.id, r.leadId)).limit(1) : Promise.resolve([]),
    db
      .select({ id: approvalRequests.id, code: approvalRequests.code, status: approvalRequests.status, decisionReason: approvalRequests.decisionReason, decidedAt: approvalRequests.decidedAt })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.type, "requirement_request"), eq(approvalRequests.entityId, id)))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(1),
  ]);
  return {
    requirement: stripStaffOnly(r),
    lines,
    organization: org[0] ?? null,
    lead: lead[0] ?? null,
    assigneeName: row.assigneeName ?? null,
    submittedByName: row.submittedByName ?? null,
    approval: approval[0] ?? null,
  };
}

export async function requirementStatusCounts(ctx: StaffContext): Promise<Partial<Record<RequirementStatus, number>>> {
  assertStaff(ctx, "requirements.view");
  const rows = await db.select({ status: requirementRequests.status, value: count() }).from(requirementRequests).groupBy(requirementRequests.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.value]));
}

// ---------------------------------------------------------------------------
// Employer Portal (scoped to the caller's organisation)
// ---------------------------------------------------------------------------

function toEmployerView(row: RequirementRow, lines: RequirementLineView[]): EmployerRequirementView {
  const { searchVector: _sv, ipHash: _ip, internalNotes: _notes, leadId: _lead, assignedToUserId: _owner, approvalRequestId: _approval, ...rest } = row;
  void [_sv, _ip, _notes, _lead, _owner, _approval];
  return { ...rest, lines };
}

function assertEmployerAccess(ctx: OrgContext<"employer">): void {
  if (!orgCan(ctx, ["employer.requirements.manage", "employer.dashboard"], "any")) {
    throw new ActionError("You do not have permission to view workforce requirements.", { code: "forbidden" });
  }
}

export type EmployerRequirementListItem = Pick<RequirementRow, "id" | "code" | "title" | "kind" | "status" | "statusReason" | "urgency" | "totalPositions" | "countryCode" | "joiningBy" | "submittedAt" | "createdAt" | "updatedAt">;

export async function listOrgRequirements(ctx: OrgContext<"employer">, filters: { status?: RequirementStatus | "open" }, page: PageQuery): Promise<Paginated<EmployerRequirementListItem>> {
  assertEmployerAccess(ctx);
  const where: SQL[] = [eq(requirementRequests.organizationId, ctx.organization.id)];
  if (filters.status === "open") where.push(inArray(requirementRequests.status, ["draft", ...OPEN_STATUSES]));
  else if (filters.status) where.push(eq(requirementRequests.status, filters.status));
  const condition = and(...where);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: requirementRequests.id,
        code: requirementRequests.code,
        title: requirementRequests.title,
        kind: requirementRequests.kind,
        status: requirementRequests.status,
        statusReason: requirementRequests.statusReason,
        urgency: requirementRequests.urgency,
        totalPositions: requirementRequests.totalPositions,
        countryCode: requirementRequests.countryCode,
        joiningBy: requirementRequests.joiningBy,
        submittedAt: requirementRequests.submittedAt,
        createdAt: requirementRequests.createdAt,
        updatedAt: requirementRequests.updatedAt,
      })
      .from(requirementRequests)
      .where(condition)
      .orderBy(desc(requirementRequests.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(requirementRequests).where(condition),
  ]);
  return paginated(rows, totals[0]?.value ?? 0, page);
}

export async function getOrgRequirement(ctx: OrgContext<"employer">, id: string): Promise<EmployerRequirementView | null> {
  assertEmployerAccess(ctx);
  const [row] = await db
    .select()
    .from(requirementRequests)
    .where(and(eq(requirementRequests.id, id), eq(requirementRequests.organizationId, ctx.organization.id)))
    .limit(1);
  if (!row) return null;
  return toEmployerView(row, await linesWithJobs(id));
}
