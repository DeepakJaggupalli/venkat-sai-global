"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { createFormAction, ok, type ActionResult, type ActionState } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { f } from "@/lib/validation";
import { audit } from "@/modules/audit";
import * as candidateActions from "@/modules/candidates/actions";
import { requireCandidate } from "@/modules/candidates/guard";
import { searchBlockableOrganizations } from "@/modules/candidates/queries";
import { selfActor, updateCandidateConsents } from "@/modules/candidates/service";
import type { CandidateSession } from "@/modules/candidates/types";
import { getConsentState, recordConsent } from "@/modules/identity/consent";
import { getSetting } from "@/modules/settings";

import { getAgeGateForCandidate } from "../onboarding/_lib/state";
import { createMyDataRequest } from "./_lib/data-requests";
import { LEDGER_PURPOSES, type LedgerPurpose } from "./_lib/consents";

/**
 * /talent/privacy actions. Each re-authorises the candidate and checks the age gate before
 * delegating to the candidates module (visibility, disclosure settings, block list, assessment /
 * reference consents) or the identity consent ledger (marketing, WhatsApp, overseas processing).
 */

const PRIVACY_PATH = "/talent/privacy";

async function gate(): Promise<{ session: CandidateSession; minor: boolean }> {
  const session = await requireCandidate();
  const ageGate = await getAgeGateForCandidate(session.candidate);
  if (ageGate.state !== "complete") redirect("/talent/onboarding");
  return { session, minor: ageGate.minor };
}

export async function saveVisibility(prev: ActionState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.saveVisibilityAction(prev, formData);
}

export async function savePrivacySettings(prev: ActionState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.savePrivacySettingsAction(prev, formData);
}

/** Organisation lookup for the block list (names only). */
export async function searchOrganizationsToBlock(query: string): Promise<{ value: string; label: string }[]> {
  const { session } = await gate();
  const q = z.string().trim().max(100).safeParse(query);
  if (!q.success || q.data.length < 2) return [];
  if (!(await rateLimit(`talent-org-search:${session.user.id}`, 60, 60)).allowed) return [];
  const rows = await searchBlockableOrganizations(session, q.data);
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

const consentsSchema = z.object({
  marketing_email: f.bool(),
  marketing_sms: f.bool(),
  whatsapp_updates: f.bool(),
  overseas_processing: f.bool(),
  share_assessment_results: f.bool(),
  contact_references: f.bool(),
});

export const saveConsents = createFormAction(consentsSchema, async (input) => {
  const { session, minor } = await gate();
  // Children get no marketing and no overseas processing (DPDP Rules 2025): never record a grant.
  const wanted: Record<LedgerPurpose, boolean> = {
    marketing_email: minor ? false : input.marketing_email,
    marketing_sms: minor ? false : input.marketing_sms,
    whatsapp_updates: input.whatsapp_updates,
    overseas_processing: minor ? false : input.overseas_processing,
  };
  const current = await getConsentState(session.user.id, [...LEDGER_PURPOSES]);
  const policyVersion = await getSetting("privacy.policy_version");
  const changed = LEDGER_PURPOSES.filter((p) => (current[p]?.granted ?? false) !== wanted[p]);
  if (changed.length) {
    await db.transaction(async (tx) => {
      for (const purpose of changed) {
        await recordConsent(
          { userId: session.user.id, purpose, granted: wanted[purpose], source: "talent_privacy_dashboard", policyVersion, contextType: "candidate_profile", contextId: session.candidate.id },
          tx,
        );
      }
      await audit({ action: "candidate.consents_updated", entityType: "candidate", entityId: session.candidate.id, metadata: { changes: changed, source: "talent_privacy_dashboard" }, tx });
    });
  }
  // Assessment sharing and reference checks belong to the candidates module (self only).
  await updateCandidateConsents(selfActor(session), { shareAssessmentResults: input.share_assessment_results, contactReferences: input.contact_references });
  revalidatePath(PRIVACY_PATH);
  return ok(undefined, "Saved");
});

export const requestDataExport = createFormAction(z.object({}), async () => {
  const { session } = await gate();
  const { code } = await createMyDataRequest(session.user, { type: "export", details: null });
  revalidatePath(PRIVACY_PATH);
  return ok({ code }, code);
});

export const requestCorrection = createFormAction(z.object({ details: f.text({ label: "Details", min: 10, max: 4000 }) }), async ({ details }) => {
  const { session } = await gate();
  const { code } = await createMyDataRequest(session.user, { type: "correction", details });
  revalidatePath(PRIVACY_PATH);
  return ok({ code }, code);
});

export const requestDeletion = createFormAction(
  z.object({ details: f.optionalText(4000), understood: f.bool() }).superRefine((v, ctx) => {
    if (!v.understood) ctx.addIssue({ code: "custom", path: ["understood"], message: "confirm_required" });
  }),
  async ({ details }) => {
    const { session } = await gate();
    const { code } = await createMyDataRequest(session.user, { type: "deletion", details: details ?? null });
    revalidatePath(PRIVACY_PATH);
    return ok({ code }, code);
  },
);
