import "server-only";

import { and, asc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";

import type { OrgPermissionFor, PlatformPermission } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import {
  applicationWorkflows,
  applications,
  candidatePrivacySettings,
  candidateProfiles,
  jobs,
  organizations,
  profileUnlocks,
  users,
  workflowStages,
  type OrgType,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { orgCan, staffCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";

import { forbiddenError, notFoundError } from "./errors";
import type { RecruitmentActor } from "./types";
import { privacyOrDefault, type CandidatePrivacy, type OrgCandidateRelation } from "./visibility";

/**
 * Shared authorization and loading helpers for the recruitment services. Every exported service
 * re-checks the actor here: permission keys first (403), then scope (an entity outside the actor's
 * scope is reported as not found, so ids cannot be probed).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Throws not-found for malformed ids (avoids a database error for garbage input). */
export function assertUuid(value: unknown, what: string): asserts value is string {
  if (!isUuid(value)) throw notFoundError(what);
}

export function assertStaff(ctx: StaffContext, permission: PlatformPermission | PlatformPermission[], mode: "all" | "any" = "all"): void {
  if (!staffCan(ctx, permission, mode)) throw forbiddenError();
}

export function assertOrg<T extends OrgType>(ctx: OrgContext<T>, permission: OrgPermissionFor<T> | OrgPermissionFor<T>[], mode: "all" | "any" = "all"): void {
  if (!orgCan(ctx, permission, mode)) throw forbiddenError();
}

/** Organisation actions that change data require an organisation that is not suspended. */
export function assertOrgActive(ctx: OrgContext): void {
  if (ctx.organization.status === "suspended" || ctx.organization.deletedAt) {
    throw new ActionError("Your organisation's account is suspended. Contact Venkat Sai Global support.", { code: "org_suspended" });
  }
}

export function assertOrgVerified(ctx: OrgContext, action: string): void {
  if (ctx.organization.status !== "verified") {
    throw new ActionError(`Your organisation must be verified before you can ${action}.`, { code: "org_not_verified" });
  }
}

// ---------------------------------------------------------------------------
// Workflows and stages
// ---------------------------------------------------------------------------

export type StageRow = typeof workflowStages.$inferSelect;

export async function loadWorkflowStages(workflowId: string, tx: DbOrTx = db): Promise<StageRow[]> {
  return tx.select().from(workflowStages).where(eq(workflowStages.workflowId, workflowId)).orderBy(asc(workflowStages.sortOrder));
}

/**
 * Workflow for a job: the job's own workflow (if active), else the organisation's default, else the
 * platform default (installed by the recruitment seed).
 */
export async function resolveWorkflowForJob(
  job: { workflowId: string | null; organizationId: string | null },
  tx: DbOrTx = db,
): Promise<{ workflowId: string; stages: StageRow[] }> {
  const candidates = await tx
    .select({ id: applicationWorkflows.id, organizationId: applicationWorkflows.organizationId, isDefault: applicationWorkflows.isDefault })
    .from(applicationWorkflows)
    .where(
      and(
        eq(applicationWorkflows.isActive, true),
        or(
          job.workflowId && isUuid(job.workflowId) ? eq(applicationWorkflows.id, job.workflowId) : sql`false`,
          and(eq(applicationWorkflows.isDefault, true), isNull(applicationWorkflows.organizationId)),
          job.organizationId ? and(eq(applicationWorkflows.isDefault, true), eq(applicationWorkflows.organizationId, job.organizationId)) : sql`false`,
        ),
      ),
    );
  const pick =
    candidates.find((w) => w.id === job.workflowId && (w.organizationId === null || w.organizationId === job.organizationId)) ??
    candidates.find((w) => w.isDefault && job.organizationId && w.organizationId === job.organizationId) ??
    candidates.find((w) => w.isDefault && w.organizationId === null);
  if (!pick) {
    throw new ActionError("Applications are not available right now. Please try again later.", { code: "workflow_missing" });
  }
  return { workflowId: pick.id, stages: await loadWorkflowStages(pick.id, tx) };
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export type ApplicationRow = typeof applications.$inferSelect;

export type ApplicationScope = ApplicationRow & {
  job: {
    id: string;
    code: string;
    title: string;
    slug: string;
    organizationId: string | null;
    managedByVenkatSai: boolean;
    isConfidential: boolean;
    confidentialEmployerName: string | null;
    requirementId: string | null;
    isOverseas: boolean;
    countryCode: string | null;
    city: string | null;
    status: string;
  };
  /** Name of the job's organisation (null for Venkat Sai-managed confidential jobs without one). */
  organizationName: string | null;
  candidateUserId: string;
};

/** Load an application with the job and candidate fields every access check needs. `lock` = FOR UPDATE on the application row. */
export async function loadApplicationScope(applicationId: string, tx: DbOrTx = db, opts: { lock?: boolean } = {}): Promise<ApplicationScope | null> {
  if (!isUuid(applicationId)) return null;
  const query = tx
    .select({
      application: applications,
      job: {
        id: jobs.id,
        code: jobs.code,
        title: jobs.title,
        slug: jobs.slug,
        organizationId: jobs.organizationId,
        managedByVenkatSai: jobs.managedByVenkatSai,
        isConfidential: jobs.isConfidential,
        confidentialEmployerName: jobs.confidentialEmployerName,
        requirementId: jobs.requirementId,
        isOverseas: jobs.isOverseas,
        countryCode: jobs.countryCode,
        city: jobs.city,
        status: jobs.status,
      },
      organizationName: organizations.name,
      candidateUserId: candidateProfiles.userId,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(eq(applications.id, applicationId))
    .limit(1);
  const rows = opts.lock ? await query.for("update", { of: applications }) : await query;
  const row = rows[0];
  return row ? { ...row.application, job: row.job, organizationName: row.organizationName, candidateUserId: row.candidateUserId } : null;
}

export type AccessLevel = "view" | "manage";

/**
 * May the actor see / act on this application?
 *  - staff: recruitment.view (view) or recruitment.manage (manage)
 *  - employer: employer.pipeline.view / .manage, own job, and the application was shared with the employer
 *  - partner: view only (partner.submissions.view), applications credited to the partner
 *  - candidate: own applications (what they may change is limited by canTransition)
 */
export function assertApplicationAccess(actor: RecruitmentActor, scope: ApplicationScope, level: AccessLevel): void {
  switch (actor.kind) {
    case "system":
      return;
    case "staff":
      if (level === "view") assertStaff(actor.ctx, ["recruitment.view", "recruitment.manage"], "any");
      else assertStaff(actor.ctx, "recruitment.manage");
      return;
    case "employer":
      assertOrg(actor.ctx, level === "view" ? "employer.pipeline.view" : "employer.pipeline.manage");
      if (scope.job.organizationId !== actor.ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Application");
      return;
    case "partner":
      assertOrg(actor.ctx, "partner.submissions.view");
      if (scope.partnerOrganizationId !== actor.ctx.organization.id) throw notFoundError("Application");
      if (level === "manage") throw forbiddenError("Recruitment partners cannot change applications.");
      return;
    case "candidate":
      if (scope.candidateId !== actor.candidateId) throw notFoundError("Application");
      return;
  }
}

/** Load + authorize in one step (throws not-found when missing or out of scope). */
export async function requireApplication(actor: RecruitmentActor, applicationId: string, level: AccessLevel, tx: DbOrTx = db, opts: { lock?: boolean } = {}): Promise<ApplicationScope> {
  const scope = await loadApplicationScope(applicationId, tx, opts);
  if (!scope) throw notFoundError("Application");
  assertApplicationAccess(actor, scope, level);
  return scope;
}

// ---------------------------------------------------------------------------
// Candidates as seen by organisations
// ---------------------------------------------------------------------------

export type CandidateIdentityRow = {
  candidateId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  userStatus: string;
  visibility: (typeof candidateProfiles.$inferSelect)["visibility"];
  deletedAt: Date | null;
  sourcedByPartnerOrgId: string | null;
  privacy: CandidatePrivacy;
};

export async function loadCandidateIdentity(candidateId: string, tx: DbOrTx = db): Promise<CandidateIdentityRow | null> {
  if (!isUuid(candidateId)) return null;
  const [row] = await tx
    .select({
      candidateId: candidateProfiles.id,
      userId: candidateProfiles.userId,
      displayName: users.displayName,
      email: users.email,
      phone: users.phone,
      userStatus: users.status,
      visibility: candidateProfiles.visibility,
      deletedAt: candidateProfiles.deletedAt,
      sourcedByPartnerOrgId: candidateProfiles.sourcedByPartnerOrgId,
      privacy: {
        showFullNameToEmployers: candidatePrivacySettings.showFullNameToEmployers,
        showContactToUnlockedOnly: candidatePrivacySettings.showContactToUnlockedOnly,
        showPhoto: candidatePrivacySettings.showPhoto,
        showCurrentEmployer: candidatePrivacySettings.showCurrentEmployer,
        allowDirectContact: candidatePrivacySettings.allowDirectContact,
        blockedOrganizationIds: candidatePrivacySettings.blockedOrganizationIds,
        allowPartnerSubmissions: candidatePrivacySettings.allowPartnerSubmissions,
      },
    })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  if (!row) return null;
  return { ...row, privacy: privacyOrDefault(row.privacy) };
}

/** Has the candidate shared an application with this organisation (any of its jobs)? */
export async function hasSharedApplicationWithOrg(organizationId: string, candidateId: string, tx: DbOrTx = db): Promise<boolean> {
  const [row] = await tx
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.candidateId, candidateId), eq(jobs.organizationId, organizationId), isNotNull(applications.sharedWithEmployerAt), isNotNull(applications.consentToShareAt)))
    .limit(1);
  return Boolean(row);
}

export async function hasActiveUnlock(organizationId: string, candidateId: string, tx: DbOrTx = db, now: Date = new Date()): Promise<boolean> {
  const [row] = await tx
    .select({ id: profileUnlocks.id })
    .from(profileUnlocks)
    .where(
      and(
        eq(profileUnlocks.organizationId, organizationId),
        eq(profileUnlocks.candidateId, candidateId),
        isNull(profileUnlocks.revokedAt),
        or(isNull(profileUnlocks.expiresAt), gt(profileUnlocks.expiresAt, now)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function loadOrgCandidateRelation(organizationId: string, candidateId: string, tx: DbOrTx = db): Promise<OrgCandidateRelation> {
  // Sequential: `tx` may be a transaction (one connection).
  const hasSharedApplication = await hasSharedApplicationWithOrg(organizationId, candidateId, tx);
  return { hasSharedApplication, hasActiveUnlock: await hasActiveUnlock(organizationId, candidateId, tx) };
}

/** Display name of a job's employer as candidates and the public may see it (confidential jobs hide the organisation). */
export function publicEmployerName(job: { isConfidential: boolean; confidentialEmployerName: string | null; organizationId: string | null }, organizationName: string | null): string {
  if (job.isConfidential || !job.organizationId) return job.confidentialEmployerName ?? "Confidential employer";
  return organizationName ?? job.confidentialEmployerName ?? "Employer";
}
