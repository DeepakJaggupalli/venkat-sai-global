import "server-only";

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { forbidden, notFound } from "next/navigation";
import { cache } from "react";

import { db, type DbOrTx } from "@/db";
import { candidatePrivacySettings, candidateProfiles } from "@/db/schema";
import type { CandidateSource } from "@/db/schema/candidates";
import { logger } from "@/lib/logger";
import { audit } from "@/modules/audit";
import { requireUser } from "@/modules/identity/session";
import { isFeatureEnabled } from "@/modules/settings";

import { refreshCandidateDerived } from "./derived";
import type { CandidateProfileRow, CandidateSession } from "./types";

const ACTIVITY_TOUCH_MS = 15 * 60_000;

export type EnsureCandidateOptions = {
  source?: CandidateSource;
  /** Partner organisation that created / first sourced the profile (informational attribution). */
  sourcedByPartnerOrgId?: string | null;
  /** Staff or partner user creating the profile on the candidate's behalf. */
  createdByUserId?: string | null;
  tx?: DbOrTx;
};

/**
 * Load the candidate profile of a user, creating it (with protective default privacy settings and
 * visibility `venkat_sai_only`) when it does not exist yet. Safe under concurrency (unique userId).
 * Used by requireCandidate() and by modules that create profiles on a candidate's behalf (partner
 * submissions, staff imports) — those callers are responsible for authorising the creation.
 */
export async function ensureCandidateProfile(userId: string, opts: EnsureCandidateOptions = {}): Promise<CandidateProfileRow> {
  const findExisting = async (tx: DbOrTx): Promise<CandidateProfileRow | null> => {
    const [existing] = await tx
      .select({ profile: candidateProfiles, privacyId: candidatePrivacySettings.candidateId })
      .from(candidateProfiles)
      .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
      .where(eq(candidateProfiles.userId, userId))
      .limit(1);
    if (!existing) return null;
    // Profiles created by other modules may lack the privacy row; create it with the protective defaults.
    if (!existing.privacyId) await tx.insert(candidatePrivacySettings).values({ candidateId: existing.profile.id }).onConflictDoNothing();
    return existing.profile;
  };

  // Fast path without a transaction: almost every call finds the profile.
  const found = await findExisting(opts.tx ?? db);
  if (found) return found;

  const run = async (tx: DbOrTx): Promise<CandidateProfileRow> => {
    const existing = await findExisting(tx);
    if (existing) return existing;
    const [created] = await tx
      .insert(candidateProfiles)
      .values({
        userId,
        source: opts.source ?? "self",
        sourcedByPartnerOrgId: opts.sourcedByPartnerOrgId ?? null,
        createdByUserId: opts.createdByUserId ?? null,
        lastActiveAt: opts.source && opts.source !== "self" ? null : new Date(),
      })
      .onConflictDoNothing({ target: candidateProfiles.userId })
      .returning();
    if (!created) {
      const [raced] = await tx.select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
      if (!raced) throw new Error("ensureCandidateProfile: profile vanished after a concurrent insert");
      return raced;
    }
    await tx.insert(candidatePrivacySettings).values({ candidateId: created.id }).onConflictDoNothing();
    const { profile } = await refreshCandidateDerived(created.id, tx);
    await audit({
      action: "candidate.profile_created",
      entityType: "candidate",
      entityId: created.id,
      metadata: { source: created.source, sourcedByPartnerOrgId: created.sourcedByPartnerOrgId, onBehalf: Boolean(opts.createdByUserId) },
      ...(opts.createdByUserId ? { actorUserId: opts.createdByUserId } : {}),
      tx,
    });
    return profile;
  };
  return opts.tx ? run(opts.tx) : db.transaction(run);
}

/** The candidate profile of a user, or null (never creates one). */
export async function getCandidateByUserId(userId: string, tx: DbOrTx = db): Promise<CandidateProfileRow | null> {
  const [row] = await tx.select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
  return row ?? null;
}

/** A candidate profile by id, or null. No authorisation: callers must scope access (see viewer.ts). */
export async function getCandidateById(candidateId: string, tx: DbOrTx = db): Promise<CandidateProfileRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return null;
  const [row] = await tx.select().from(candidateProfiles).where(eq(candidateProfiles.id, candidateId)).limit(1);
  return row ?? null;
}

/** Record activity (search ranking "recently active") at most every 15 minutes, without blocking the request. */
function touchLastActive(candidate: CandidateProfileRow): void {
  if (candidate.lastActiveAt && Date.now() - candidate.lastActiveAt.getTime() < ACTIVITY_TOUCH_MS) return;
  const threshold = new Date(Date.now() - ACTIVITY_TOUCH_MS);
  db.update(candidateProfiles)
    .set({ lastActiveAt: new Date() })
    .where(and(eq(candidateProfiles.id, candidate.id), or(isNull(candidateProfiles.lastActiveAt), lt(candidateProfiles.lastActiveAt, threshold))))
    .catch((error) => logger.warn("Failed to record candidate activity", { error }));
}

const loadCandidateSession = cache(async (userId: string): Promise<CandidateProfileRow> => ensureCandidateProfile(userId, { source: "self" }));

/**
 * People Portal guard: a signed-in user plus their candidate profile (created on first use).
 * Call it in every /talent page AND every People Portal server action (layouts do not protect actions).
 * 404 when the People Portal is switched off; 403 for an erased (anonymised) profile.
 */
export async function requireCandidate(): Promise<CandidateSession> {
  const user = await requireUser();
  if (!(await isFeatureEnabled("portal.talent", { portal: "talent" }))) notFound();
  let candidate = await loadCandidateSession(user.id);
  if (candidate.deletedAt) forbidden();
  // The contact was verified after the profile was created (identity flows do not touch profiles):
  // refresh once so the "basic" verification level and the completeness points appear.
  if (candidate.verificationLevel === "none" && (user.emailVerifiedAt || user.phoneVerifiedAt)) {
    candidate = (await db.transaction((tx) => refreshCandidateDerived(candidate.id, tx))).profile;
  }
  touchLastActive(candidate);
  return { user, candidate };
}
