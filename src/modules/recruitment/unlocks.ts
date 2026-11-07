import "server-only";

import { and, count, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { applications, fileAccessGrants, jobs, organizations, profileUnlocks, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit, logDataAccess } from "@/modules/audit";
import { PROFILE_GRANT_CONTEXT, revokeOrganizationProfileGrants } from "@/modules/candidates/file-grants";
import { checkEntitlement, consumeEntitlement, EntitlementError } from "@/modules/commercial/entitlements";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { isFeatureEnabled } from "@/modules/settings";

import { assertOrg, assertOrgActive, assertOrgVerified, assertStaff, assertUuid, isUuid, loadCandidateIdentity, loadOrgCandidateRelation } from "./access";
import { loadCandidateCards, type CandidateCard } from "./candidate-cards";
import { forbiddenError, notFoundError } from "./errors";
import { unlockCandidateSchema } from "./schemas";
import type { CandidateActor } from "./types";
import { isDiscoverableByOrg, UNLOCK_VALIDITY_DAYS } from "./visibility";

/**
 * Profile unlocks: an employer reveals a discoverable candidate's contact details, consuming a
 * "candidate_unlocks" entitlement. The unlock lasts UNLOCK_VALIDITY_DAYS (90) days; repeat views
 * inside that window are free but every reveal is written to data_access_logs. Candidates can see
 * who unlocked them, and blocking an organisation revokes its unlock. A revoked or lapsed unlock also
 * withdraws the organisation's candidate-profile file grants.
 */

export type CandidateContact = { candidateId: string; displayName: string; email: string | null; phone: string | null };

export type UnlockResult = {
  /** How the organisation is entitled to the contact details. */
  entitledBy: "unlock" | "application";
  unlockId: string | null;
  expiresAt: Date | null;
  /** A credit was used by this call (false for an existing unlock or an application relationship). */
  creditConsumed: boolean;
  contact: CandidateContact;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isActiveUnlock(row: { revokedAt: Date | null; expiresAt: Date | null } | undefined, now: Date): boolean {
  return Boolean(row && !row.revokedAt && (!row.expiresAt || row.expiresAt.getTime() > now.getTime()));
}

async function logContactReveal(
  input: { actorUserId: string; organizationId: string | null; subjectUserId: string; candidateId: string; reason: string; metadata?: Record<string, unknown> },
  tx: DbOrTx = db,
): Promise<void> {
  await logDataAccess(
    {
      actorUserId: input.actorUserId,
      actorOrganizationId: input.organizationId,
      subjectUserId: input.subjectUserId,
      subjectType: "candidate",
      subjectId: input.candidateId,
      dataCategory: "contact",
      accessType: "reveal",
      reason: input.reason,
      metadata: input.metadata ?? {},
    },
    tx,
  );
}

/**
 * Unlock a candidate's contact details for the employer (employer.candidates.unlock, verified
 * organisation, candidate search enabled). The candidate must be discoverable by the organisation
 * and must not have blocked it. Returns the contact details.
 */
export async function unlockCandidate(ctx: OrgContext<"employer">, candidateId: string, opts: { jobId?: string | null; reason?: string | null } = {}): Promise<UnlockResult> {
  assertOrg(ctx, "employer.candidates.unlock");
  assertOrgActive(ctx);
  assertOrgVerified(ctx, "unlock candidate contact details");
  const data = unlockCandidateSchema.parse({ candidateId, jobId: opts.jobId ?? null, reason: opts.reason ?? null });
  if (!(await isFeatureEnabled("employer.candidate_search", { portal: "employer", organizationId: ctx.organization.id }))) {
    throw new ActionError("Candidate search is not available right now.", { code: "feature_disabled" });
  }
  const candidate = await loadCandidateIdentity(data.candidateId);
  if (!candidate || candidate.deletedAt || candidate.userStatus === "closed" || candidate.userStatus === "suspended") throw notFoundError("Candidate");
  const relation = await loadOrgCandidateRelation(ctx.organization.id, candidate.candidateId);
  const contact: CandidateContact = { candidateId: candidate.candidateId, displayName: candidate.displayName, email: candidate.email, phone: candidate.phone };

  if (candidate.privacy.blockedOrganizationIds.includes(ctx.organization.id)) throw notFoundError("Candidate");
  if (relation.hasSharedApplication) {
    await logContactReveal({ actorUserId: ctx.user.id, organizationId: ctx.organization.id, subjectUserId: candidate.userId, candidateId: candidate.candidateId, reason: "application" });
    return { entitledBy: "application", unlockId: null, expiresAt: null, creditConsumed: false, contact };
  }
  if (!isDiscoverableByOrg(candidate, candidate.privacy, { id: ctx.organization.id, status: ctx.organization.status })) throw notFoundError("Candidate");
  if (data.jobId) {
    const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, data.jobId), eq(jobs.organizationId, ctx.organization.id))).limit(1);
    if (!job) throw notFoundError("Job");
  }

  // checkEntitlement reads through the global pool, so it runs before the transaction (inside it, it would hold
  // one connection while waiting for another). consumeEntitlement re-checks the allowance under the ledger lock.
  const [current] = await db
    .select({ revokedAt: profileUnlocks.revokedAt, expiresAt: profileUnlocks.expiresAt })
    .from(profileUnlocks)
    .where(and(eq(profileUnlocks.organizationId, ctx.organization.id), eq(profileUnlocks.candidateId, candidate.candidateId)))
    .limit(1);
  if (!isActiveUnlock(current, new Date())) {
    const entitlement = await checkEntitlement(ctx.organization.id, "candidate_unlocks");
    if (!entitlement.allowed) {
      throw new ActionError(entitlement.reason ?? "You have no candidate unlocks left. Upgrade your plan or add credits.", { code: "entitlement_exhausted" });
    }
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`unlock:${ctx.organization.id}:${candidate.candidateId}`}, 0))`);
      const now = new Date();
      const [existing] = await tx
        .select()
        .from(profileUnlocks)
        .where(and(eq(profileUnlocks.organizationId, ctx.organization.id), eq(profileUnlocks.candidateId, candidate.candidateId)))
        .limit(1)
        .for("update");
      if (existing && isActiveUnlock(existing, now)) {
        await logContactReveal({ actorUserId: ctx.user.id, organizationId: ctx.organization.id, subjectUserId: candidate.userId, candidateId: candidate.candidateId, reason: "profile_unlock", metadata: { unlockId: existing.id } }, tx);
        return { entitledBy: "unlock" as const, unlockId: existing.id, expiresAt: existing.expiresAt, creditConsumed: false, contact };
      }

      const expiresAt = new Date(now.getTime() + UNLOCK_VALIDITY_DAYS * DAY_MS);
      const values = {
        unlockedByUserId: ctx.user.id,
        jobId: data.jobId,
        unlockedAt: now,
        expiresAt,
        reason: data.reason,
        revokedAt: null,
        revokedReason: null,
      };
      let unlockId: string;
      if (existing) {
        await tx.update(profileUnlocks).set(values).where(eq(profileUnlocks.id, existing.id));
        unlockId = existing.id;
      } else {
        const [row] = await tx.insert(profileUnlocks).values({ organizationId: ctx.organization.id, candidateId: candidate.candidateId, ...values }).returning({ id: profileUnlocks.id });
        unlockId = row!.id;
      }
      // Consumption is idempotent per reference and a renewal reuses the row, so each renewal gets its own reference.
      const referenceId = existing ? `${unlockId}:${expiresAt.toISOString()}` : unlockId;
      await consumeEntitlement(ctx.organization.id, "candidate_unlocks", { reference: { type: "profile_unlock", id: referenceId }, actorUserId: ctx.user.id, tx });
      await logContactReveal({ actorUserId: ctx.user.id, organizationId: ctx.organization.id, subjectUserId: candidate.userId, candidateId: candidate.candidateId, reason: "profile_unlock", metadata: { unlockId } }, tx);
      await audit({
        action: existing ? "candidate.unlock_renewed" : "candidate.unlocked",
        entityType: "candidate",
        entityId: candidate.candidateId,
        organizationId: ctx.organization.id,
        actorUserId: ctx.user.id,
        actorType: "user",
        metadata: { unlockId, jobId: data.jobId, expiresAt: expiresAt.toISOString() },
        tx,
      });
      return { entitledBy: "unlock" as const, unlockId, expiresAt, creditConsumed: true, contact };
    });
  } catch (error) {
    if (error instanceof EntitlementError) throw new ActionError(error.message, { code: "entitlement_exhausted" });
    throw error;
  }
}

/**
 * Show a candidate's contact details to an employer that is entitled to them (an application shared
 * with the organisation, or an active unlock). Every call is logged.
 */
export async function revealCandidateContact(ctx: OrgContext<"employer">, candidateId: string): Promise<CandidateContact> {
  assertOrg(ctx, ["employer.pipeline.view", "employer.candidates.unlock"], "any");
  if (!isUuid(candidateId)) throw notFoundError("Candidate");
  const candidate = await loadCandidateIdentity(candidateId);
  if (!candidate || candidate.deletedAt || candidate.privacy.blockedOrganizationIds.includes(ctx.organization.id)) throw notFoundError("Candidate");
  const relation = await loadOrgCandidateRelation(ctx.organization.id, candidate.candidateId);
  if (!relation.hasSharedApplication && !relation.hasActiveUnlock) throw forbiddenError("Unlock this profile to see the contact details.");
  await logContactReveal({
    actorUserId: ctx.user.id,
    organizationId: ctx.organization.id,
    subjectUserId: candidate.userId,
    candidateId: candidate.candidateId,
    reason: relation.hasSharedApplication ? "application" : "profile_unlock",
  });
  return { candidateId: candidate.candidateId, displayName: candidate.displayName, email: candidate.email, phone: candidate.phone };
}

/** Staff reveal (candidates.view_contact), always with a reason; logged. */
export async function revealCandidateContactForStaff(ctx: StaffContext, candidateId: string, reason: string): Promise<CandidateContact> {
  assertStaff(ctx, "candidates.view_contact");
  const why = reason.trim();
  if (why.length < 3) throw new ActionError("Give a reason for viewing the contact details.", { fieldErrors: { reason: ["Required"] } });
  const candidate = await loadCandidateIdentity(candidateId);
  if (!candidate) throw notFoundError("Candidate");
  await logContactReveal({ actorUserId: ctx.user.id, organizationId: null, subjectUserId: candidate.userId, candidateId: candidate.candidateId, reason: why.slice(0, 300) });
  return { candidateId: candidate.candidateId, displayName: candidate.displayName, email: candidate.email, phone: candidate.phone };
}

/**
 * Revoke organisations' unlocks of a candidate (call when the candidate blocks organisations or
 * hides the profile). Pass no organisation ids to revoke every unlock. Those organisations' profile
 * file grants are withdrawn too. Returns how many unlocks were revoked.
 */
export async function revokeUnlocksForCandidate(
  candidateId: string,
  opts: { organizationIds?: string[]; reason: string; actorUserId?: string | null; tx?: DbOrTx },
): Promise<number> {
  assertUuid(candidateId, "Candidate");
  const executor = opts.tx ?? db;
  const ids = (opts.organizationIds ?? []).filter(isUuid);
  if (opts.organizationIds && !ids.length) return 0;
  const rows = await executor
    .update(profileUnlocks)
    .set({ revokedAt: new Date(), revokedReason: opts.reason.slice(0, 300) })
    .where(and(eq(profileUnlocks.candidateId, candidateId), isNull(profileUnlocks.revokedAt), ids.length ? inArray(profileUnlocks.organizationId, ids) : undefined))
    .returning({ id: profileUnlocks.id, organizationId: profileUnlocks.organizationId });
  for (const row of rows) {
    await audit({ action: "candidate.unlock_revoked", entityType: "candidate", entityId: candidateId, organizationId: row.organizationId, actorType: "system", metadata: { unlockId: row.id, reason: opts.reason }, tx: opts.tx });
  }
  await revokeOrganizationProfileGrants(
    candidateId,
    rows.map((r) => r.organizationId),
    opts.actorUserId ?? null,
    executor,
  );
  return rows.length;
}

/** How far back the hourly recruitment.expire_unlocks task looks for unlocks that lapsed. */
const LAPSED_UNLOCK_LOOKBACK_MS = 2 * DAY_MS;

/**
 * Unlocks that lapsed recently: withdraw the organisation's candidate-profile file grants, unless an application
 * shared with the organisation still entitles it. The candidate viewer re-grants whatever is still allowed on the
 * next view, so this only closes the gap until then. Idempotent; returns how many unlocks were processed.
 */
export async function revokeGrantsForLapsedUnlocks(now: Date = new Date(), limit = 500): Promise<number> {
  const rows = await db
    .select({ candidateId: profileUnlocks.candidateId, organizationId: profileUnlocks.organizationId })
    .from(profileUnlocks)
    .where(
      and(
        isNull(profileUnlocks.revokedAt),
        lte(profileUnlocks.expiresAt, now),
        gt(profileUnlocks.expiresAt, new Date(now.getTime() - LAPSED_UNLOCK_LOOKBACK_MS)),
        sql`exists (select 1 from ${fileAccessGrants}
          where ${fileAccessGrants.contextType} = ${PROFILE_GRANT_CONTEXT} and ${fileAccessGrants.contextId} = ${profileUnlocks.candidateId}
            and ${fileAccessGrants.granteeOrganizationId} = ${profileUnlocks.organizationId} and ${fileAccessGrants.revokedAt} is null)`,
        sql`not exists (select 1 from ${applications} inner join ${jobs} on ${jobs.id} = ${applications.jobId}
          where ${applications.candidateId} = ${profileUnlocks.candidateId} and ${jobs.organizationId} = ${profileUnlocks.organizationId}
            and ${applications.consentToShareAt} is not null and ${applications.sharedWithEmployerAt} is not null and ${applications.status} <> 'withdrawn')`,
      ),
    )
    .limit(limit);
  for (const row of rows) {
    await revokeOrganizationProfileGrants(row.candidateId, [row.organizationId], null);
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type OrgUnlockListItem = {
  unlockId: string;
  candidate: CandidateCard | null;
  unlockedAt: Date;
  expiresAt: Date | null;
  active: boolean;
  unlockedByName: string | null;
  jobId: string | null;
};

/** The employer's unlocked candidates, newest first (cards respect privacy; candidates who blocked the organisation are omitted). */
export async function listUnlocksForOrg(ctx: OrgContext<"employer">, page: PageQuery, opts: { activeOnly?: boolean } = {}): Promise<Paginated<OrgUnlockListItem>> {
  assertOrg(ctx, ["employer.candidates.unlock", "employer.candidates.search"], "any");
  const now = new Date();
  const activeCondition = and(isNull(profileUnlocks.revokedAt), or(isNull(profileUnlocks.expiresAt), gt(profileUnlocks.expiresAt, now)));
  const where = and(eq(profileUnlocks.organizationId, ctx.organization.id), opts.activeOnly ? activeCondition : undefined);
  const [rows, total] = await Promise.all([
    db
      .select({ unlock: profileUnlocks, unlockedByName: users.displayName })
      .from(profileUnlocks)
      .leftJoin(users, eq(users.id, profileUnlocks.unlockedByUserId))
      .where(where)
      .orderBy(desc(profileUnlocks.unlockedAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(profileUnlocks).where(where),
  ]);
  const cards = await loadCandidateCards({ kind: "organization", organizationId: ctx.organization.id }, rows.map((r) => r.unlock.candidateId));
  const byId = new Map(cards.map((c) => [c.candidateId, c]));
  return paginated(
    rows.map((r) => ({
      unlockId: r.unlock.id,
      candidate: byId.get(r.unlock.candidateId) ?? null,
      unlockedAt: r.unlock.unlockedAt,
      expiresAt: r.unlock.expiresAt,
      active: !r.unlock.revokedAt && (!r.unlock.expiresAt || r.unlock.expiresAt.getTime() > now.getTime()),
      unlockedByName: r.unlockedByName,
      jobId: r.unlock.jobId,
    })),
    total[0]?.value ?? 0,
    page,
  );
}

export type CandidateUnlockListItem = { organizationName: string; unlockedAt: Date; expiresAt: Date | null; active: boolean; revokedAt: Date | null };

/** Which organisations unlocked the candidate's contact details (People Portal privacy page). */
export async function listUnlocksForCandidate(actor: CandidateActor): Promise<CandidateUnlockListItem[]> {
  const now = new Date();
  const rows = await db
    .select({ unlock: profileUnlocks, organizationName: organizations.name })
    .from(profileUnlocks)
    .innerJoin(organizations, eq(organizations.id, profileUnlocks.organizationId))
    .where(eq(profileUnlocks.candidateId, actor.candidateId))
    .orderBy(desc(profileUnlocks.unlockedAt))
    .limit(500);
  return rows.map((r) => ({
    organizationName: r.organizationName,
    unlockedAt: r.unlock.unlockedAt,
    expiresAt: r.unlock.expiresAt,
    active: !r.unlock.revokedAt && (!r.unlock.expiresAt || r.unlock.expiresAt.getTime() > now.getTime()),
    revokedAt: r.unlock.revokedAt,
  }));
}
