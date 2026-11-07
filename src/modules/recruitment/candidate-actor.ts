import "server-only";

import { requireCandidate } from "@/modules/candidates/guard";

import { asCandidate } from "./actors";
import type { CandidateActor } from "./types";

/**
 * The signed-in person as a candidate actor for People Portal actions. Delegates to the candidates
 * module's guard (requireCandidate(): sign-in, People Portal flag, profile created on first use,
 * erased profiles refused).
 */
export async function requireCandidateActor(): Promise<CandidateActor> {
  return asCandidate(await requireCandidate());
}
