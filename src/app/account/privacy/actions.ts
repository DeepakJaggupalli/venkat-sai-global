"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { audit } from "@/modules/audit";
import { recordConsent } from "@/modules/identity/consent";
import { requireUser } from "@/modules/identity/session";
import { getSetting } from "@/modules/settings";

import { COMMUNICATION_LABELS, COMMUNICATION_PURPOSES, isChildAccount } from "./_lib";

const schema = z.object({
  marketing_email: f.bool(),
  marketing_sms: f.bool(),
  whatsapp_updates: f.bool(),
  /** Purposes shown on the form; only those are recorded (unchanged ones are skipped by comparing to `current`). */
  current: z.string().max(200).optional(),
});

/** Save communication consents from /account/privacy. Only changed purposes are written to the ledger. */
export const saveCommunicationConsentsAction = createFormAction(schema, async (input) => {
  const user = await requireUser();
  const child = await isChildAccount(user.id);
  const current = new Set((input.current ?? "").split(",").filter(Boolean));
  const policyVersion = String(await getSetting("privacy.policy_version"));
  let changed = 0;
  for (const purpose of COMMUNICATION_PURPOSES) {
    const granted = input[purpose];
    if (granted === current.has(purpose)) continue;
    if (granted && child && COMMUNICATION_LABELS[purpose].marketing) throw new ActionError("Marketing messages are not available for accounts of people under 18.");
    await recordConsent({ userId: user.id, purpose, granted, source: "account_privacy", policyVersion });
    changed += 1;
  }
  if (changed) await audit({ action: "user.consents_updated", entityType: "user", entityId: user.id, metadata: { changed, source: "account_privacy" } });
  revalidatePath("/account/privacy");
  return ok(undefined, changed ? "Your choices are saved" : "No changes to save");
});
