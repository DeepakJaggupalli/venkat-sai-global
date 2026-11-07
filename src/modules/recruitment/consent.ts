import "server-only";

import { db, type DbOrTx } from "@/db";
import { consentRecords } from "@/db/schema";
import { getRequestMeta } from "@/lib/request";
import type { RecordConsentInput } from "@/modules/identity/consent";
import { getSetting } from "@/modules/settings";

/**
 * Consent ledger writes that need the new row's id (applications.consentRecordId,
 * partner_submissions.consentRecordId). Same row shape as recordConsent() in the identity module,
 * which does not return the id.
 */
export async function insertConsentRecord(input: RecordConsentInput & { userId: string }, tx: DbOrTx = db): Promise<string> {
  const meta = await getRequestMeta().catch(() => null);
  const policyVersion = input.policyVersion ?? (await getSetting("privacy.policy_version").catch(() => null));
  const [row] = await tx
    .insert(consentRecords)
    .values({
      userId: input.userId,
      anonymousId: null,
      purpose: input.purpose,
      granted: input.granted,
      source: input.source,
      policyVersion: policyVersion ?? null,
      contextType: input.contextType ?? null,
      contextId: input.contextId ?? null,
      capturedByUserId: input.capturedByUserId ?? null,
      evidence: input.evidence ?? {},
      ipHash: meta?.ipHash ?? null,
    })
    .returning({ id: consentRecords.id });
  return row!.id;
}
