import "server-only";

import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { applications, jobs, talentListItems, talentLists, workflowStages } from "@/db/schema";
import type { OrgContext } from "@/modules/identity/authz";

/**
 * Local read models for the employer candidate view (recruitment has no "applications of one
 * candidate to my organisation" query yet). Call only after getCandidateView() allowed the viewer.
 */

export type OrgApplicationForCandidate = { id: string; code: string; jobId: string; jobTitle: string; stageName: string; status: string; createdAt: Date };

/** Applications this candidate made to the organisation's jobs that were shared with the employer. */
export async function listOrgApplicationsForCandidate(ctx: OrgContext<"employer">, candidateId: string): Promise<OrgApplicationForCandidate[]> {
  return db
    .select({ id: applications.id, code: applications.code, jobId: jobs.id, jobTitle: jobs.title, stageName: workflowStages.name, status: applications.status, createdAt: applications.createdAt })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
    .where(and(eq(applications.candidateId, candidateId), eq(jobs.organizationId, ctx.organization.id), isNotNull(applications.sharedWithEmployerAt), isNull(jobs.deletedAt)))
    .orderBy(desc(applications.createdAt))
    .limit(20);
}

export type ListMembership = { listId: string; listName: string; note: string | null; stage: string | null; addedAt: Date };

/** Talent lists (shared with the team, or the member's own) that hold this candidate, with internal notes. */
export async function listListMemberships(ctx: OrgContext<"employer">, candidateId: string): Promise<ListMembership[]> {
  return db
    .select({ listId: talentLists.id, listName: talentLists.name, note: talentListItems.note, stage: talentListItems.stage, addedAt: talentListItems.createdAt })
    .from(talentListItems)
    .innerJoin(talentLists, eq(talentLists.id, talentListItems.listId))
    .where(
      and(
        eq(talentListItems.candidateId, candidateId),
        eq(talentLists.organizationId, ctx.organization.id),
        isNull(talentLists.archivedAt),
        or(eq(talentLists.isShared, true), eq(talentLists.createdByUserId, ctx.user.id)),
      ),
    )
    .orderBy(desc(talentListItems.createdAt))
    .limit(20);
}
