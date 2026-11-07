import "server-only";

import { eq, sql } from "drizzle-orm";

import type { PlatformPermission } from "@/config/permissions";
import { type DbOrTx } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import type { CandidateActor, CandidateProfileRow, CandidateSession } from "./types";

/** The profile an actor is allowed to change, locked for the rest of the transaction. */
export type CandidateTarget = {
  candidate: CandidateProfileRow;
  candidateId: string;
  /** Owner of the profile (users.id). */
  userId: string;
  /** Who performs the change. */
  actorUserId: string;
  /** True when staff act on the candidate's behalf (audited as such). */
  onBehalf: boolean;
  staff: StaffContext | null;
};

/** Wrap a requireCandidate() session as an actor. */
export function selfActor(session: CandidateSession): CandidateActor {
  return { kind: "self", user: session.user, candidate: session.candidate };
}

export function staffActor(staff: StaffContext, candidateId: string): CandidateActor {
  return { kind: "staff", staff, candidateId };
}

/**
 * Authorise an actor for a candidate profile and lock the row (`FOR UPDATE`) so concurrent edits
 * serialise and the derived columns stay consistent. Must run inside a transaction.
 *  - self: the session's own profile (ownership proven by requireCandidate()).
 *  - staff: needs `permission` (default candidates.manage).
 */
export async function lockCandidateTarget(actor: CandidateActor, tx: DbOrTx, permission: PlatformPermission = "candidates.manage"): Promise<CandidateTarget> {
  let candidateId: string;
  if (actor.kind === "self") {
    if (actor.candidate.userId !== actor.user.id) throw new ActionError("This profile does not belong to you.", { code: "forbidden" });
    candidateId = actor.candidate.id;
  } else {
    if (!staffCan(actor.staff, permission)) {
      throw new ActionError("You do not have permission to change candidate records.", { code: "forbidden" });
    }
    candidateId = actor.candidateId;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId)) {
    throw new ActionError("Candidate profile not found.", { code: "not_found" });
  }
  await tx.execute(sql`select id from candidate_profiles where id = ${candidateId} for update`);
  const [candidate] = await tx.select().from(candidateProfiles).where(eq(candidateProfiles.id, candidateId)).limit(1);
  if (!candidate) throw new ActionError("Candidate profile not found.", { code: "not_found" });
  if (actor.kind === "self" && candidate.userId !== actor.user.id) throw new ActionError("This profile does not belong to you.", { code: "forbidden" });
  if (candidate.deletedAt) throw new ActionError("This profile has been closed.", { code: "profile_closed" });
  return {
    candidate,
    candidateId,
    userId: candidate.userId,
    actorUserId: actor.kind === "self" ? actor.user.id : actor.staff.user.id,
    onBehalf: actor.kind === "staff",
    staff: actor.kind === "staff" ? actor.staff : null,
  };
}

/** Audit metadata shared by every candidate change. */
export function auditContext(target: CandidateTarget): { actorUserId: string; actorType: "user" | "staff" } {
  return { actorUserId: target.actorUserId, actorType: target.onBehalf ? "staff" : "user" };
}
