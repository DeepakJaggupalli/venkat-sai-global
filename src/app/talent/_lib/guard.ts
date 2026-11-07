import "server-only";

import { redirect } from "next/navigation";

import type { AgeGate } from "@/components/talent/onboarding/steps";
import { ActionError } from "@/lib/actions";
import { assertGuardianConsentIfMinor, requireCandidate } from "@/modules/candidates/guard";
import type { CandidateSession } from "@/modules/candidates/types";

import { getAgeGateForCandidate, ONBOARDING_PATH } from "../onboarding/_lib/state";

/**
 * People Portal page guard: requireCandidate() plus the age gate (CONVENTIONS 15.6, DPDP Rules 2025).
 * Until the date of birth is recorded, and for a child a guardian consent is granted, every page except
 * /talent/onboarding sends the candidate to the age step.
 *
 * The check lives in each page, not in the /talent layout. Layouts are not re-rendered on client
 * navigation, and a redirect thrown by the layout during one (for example straight after signing in)
 * is cached as the layout segment: the client then followed it to /talent/onboarding forever.
 */
export async function requireOnboardedCandidate(): Promise<CandidateSession & { gate: Extract<AgeGate, { state: "complete" }> }> {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect(ONBOARDING_PATH);
  return { ...session, gate };
}

/**
 * People Portal action guard for anything that collects or shares more of the candidate's data (applying,
 * enrolling, alerts, saved searches, documents, public certificate checks). The same age gate as the pages:
 * without a recorded date of birth the action is refused with `age_confirmation_required` (actions are
 * endpoints of their own, so a candidate who never opened onboarding must not get past it by posting one),
 * and a candidate under 18 without a granted guardian consent with `guardian_consent_required` (DPDP Act
 * s.9). Actions that only reduce processing (withdraw, decline, delete, switch off) keep using
 * requireCandidate().
 */
export async function requireConsentedCandidate(): Promise<CandidateSession> {
  const session = await requireCandidate();
  if (!session.candidate.dateOfBirth) {
    throw new ActionError("Confirm your date of birth in the People Portal before you continue.", { code: "age_confirmation_required" });
  }
  await assertGuardianConsentIfMinor(session.candidate);
  return session;
}
