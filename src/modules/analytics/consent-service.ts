import "server-only";

import { db } from "@/db";
import { analyticsConsentLogs, type AnalyticsConsentMethod } from "@/db/schema";
import { getConsentState, recordConsent } from "@/modules/identity/consent";

import { toLedgerChoices, toReceiptCategories, type ConsentMethod } from "./consent";
import type { ConsentReceiptInput } from "./schemas";

/**
 * Server-side receipts for cookie-consent choices (accountability, DPDP Act 2023 §6). Every choice is
 * logged in analytics_consent_logs against the random anonymous id of the consent cookie; for a signed-in
 * user the choice is also written to the identity consent ledger (consent_records) for the purposes
 * analytics_cookies / session_insights / functional_cookies — only purposes whose state changed.
 */

// Compile-time check that the client-safe method list matches the schema enumeration.
const _methodsMatch: [ConsentMethod] extends [AnalyticsConsentMethod] ? ([AnalyticsConsentMethod] extends [ConsentMethod] ? true : never) : never = true;
void _methodsMatch;

export type ConsentReceiptActor = { userId: string | null };
export type ConsentReceiptResult = { receiptId: string; ledgerPurposes: string[] };

/** Record a cookie-consent choice. The actor's user id comes from the server session, never the body. */
export async function recordConsentReceipt(input: ConsentReceiptInput, actor: ConsentReceiptActor): Promise<ConsentReceiptResult> {
  const choices = toLedgerChoices(input.categories);
  const current = actor.userId ? await getConsentState(actor.userId, ["analytics_cookies", "session_insights", "functional_cookies"]) : {};

  return db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(analyticsConsentLogs)
      .values({
        anonymousId: input.anonymousId,
        categories: toReceiptCategories(input.categories),
        method: input.method,
        policyVersion: input.version,
        locale: input.locale ?? null,
      })
      .returning({ id: analyticsConsentLogs.id });

    const ledgerPurposes: string[] = [];
    if (actor.userId) {
      for (const [purpose, granted] of Object.entries(choices) as [keyof typeof choices, boolean][]) {
        const previous = current[purpose];
        if (previous && previous.granted === granted && previous.policyVersion === input.version) continue;
        await recordConsent(
          {
            userId: actor.userId,
            anonymousId: input.anonymousId,
            purpose,
            granted,
            source: input.source,
            policyVersion: input.version,
            evidence: { method: input.method, gpc: input.gpc === true, receiptId: receipt!.id },
          },
          tx,
        );
        ledgerPurposes.push(purpose);
      }
    }
    return { receiptId: receipt!.id, ledgerPurposes };
  });
}
