import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidateProfiles, users } from "@/db/schema";
import { requireCandidate } from "@/modules/candidates/guard";

/**
 * The candidate acting in the People Portal. Training services take this instead of a session so they
 * can check ownership explicitly (enrolments, registrations, outcomes belong to `candidateId`).
 */
export type CandidateActor = { userId: string; candidateId: string; displayName: string };

/** Look up a user's candidate actor without the session guard (null when there is no active profile). */
export async function getCandidateActor(userId: string, tx: DbOrTx = db): Promise<CandidateActor | null> {
  const [row] = await tx
    .select({ candidateId: candidateProfiles.id, displayName: users.displayName, status: users.status })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(eq(candidateProfiles.userId, userId), isNull(candidateProfiles.deletedAt)))
    .limit(1);
  if (!row || row.status !== "active") return null;
  return { userId, candidateId: row.candidateId, displayName: row.displayName };
}

/**
 * The signed-in candidate for People Portal actions, through the candidates module's guard (sign-in, People
 * Portal flag, profile created on first use, erased profiles refused).
 */
export async function requireCandidateActor(): Promise<CandidateActor> {
  const { user, candidate } = await requireCandidate();
  return { userId: user.id, candidateId: candidate.id, displayName: user.displayName };
}

/** userId + display name of candidates (for notifications and certificate holder names). */
export async function candidateIdentities(candidateIds: readonly string[], tx: DbOrTx = db): Promise<Map<string, { userId: string; displayName: string; legalName: string | null }>> {
  if (!candidateIds.length) return new Map();
  const rows = await tx
    .select({ candidateId: candidateProfiles.id, userId: candidateProfiles.userId, displayName: users.displayName, legalName: candidateProfiles.legalName })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(inArray(candidateProfiles.id, [...new Set(candidateIds)]));
  return new Map(rows.map((r) => [r.candidateId, { userId: r.userId, displayName: r.displayName, legalName: r.legalName }]));
}
