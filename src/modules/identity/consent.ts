import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { consentRecords } from "@/db/schema";
import type { ConsentPurpose } from "@/db/schema/_constants";
import { getRequestMeta } from "@/lib/request";

/**
 * Consent ledger (append-only). The latest record per (subject, purpose) is the current state.
 * Record consent wherever personal data is used for an optional purpose: marketing, profile
 * discoverability, sharing with employers, partner submissions, overseas processing, testimonials,
 * analytics cookies, session insights.
 */
export type RecordConsentInput = {
  userId?: string | null;
  anonymousId?: string | null;
  purpose: ConsentPurpose;
  granted: boolean;
  source: string;
  policyVersion?: string | null;
  contextType?: string | null;
  contextId?: string | null;
  capturedByUserId?: string | null;
  evidence?: Record<string, unknown>;
};

export async function recordConsent(input: RecordConsentInput, tx: DbOrTx = db): Promise<void> {
  if (!input.userId && !input.anonymousId) throw new Error("recordConsent requires userId or anonymousId");
  const meta = await getRequestMeta().catch(() => null);
  await tx.insert(consentRecords).values({
    userId: input.userId ?? null,
    anonymousId: input.anonymousId ?? null,
    purpose: input.purpose,
    granted: input.granted,
    source: input.source,
    policyVersion: input.policyVersion ?? null,
    contextType: input.contextType ?? null,
    contextId: input.contextId ?? null,
    capturedByUserId: input.capturedByUserId ?? null,
    evidence: input.evidence ?? {},
    ipHash: meta?.ipHash ?? null,
  });
}

export async function recordConsents(
  base: Omit<RecordConsentInput, "purpose" | "granted">,
  choices: Partial<Record<ConsentPurpose, boolean>>,
  tx: DbOrTx = db,
): Promise<void> {
  for (const [purpose, granted] of Object.entries(choices) as [ConsentPurpose, boolean][]) {
    await recordConsent({ ...base, purpose, granted }, tx);
  }
}

export type ConsentState = { granted: boolean; at: Date; source: string; policyVersion: string | null };

/** Current consent state for a user across purposes (missing = never asked). */
export async function getConsentState(userId: string, purposes?: ConsentPurpose[]): Promise<Partial<Record<ConsentPurpose, ConsentState>>> {
  const rows = await db
    .select()
    .from(consentRecords)
    .where(purposes?.length ? and(eq(consentRecords.userId, userId), inArray(consentRecords.purpose, purposes)) : eq(consentRecords.userId, userId))
    .orderBy(desc(consentRecords.createdAt));
  const state: Partial<Record<ConsentPurpose, ConsentState>> = {};
  for (const r of rows) {
    if (state[r.purpose]) continue;
    state[r.purpose] = { granted: r.granted, at: r.createdAt, source: r.source, policyVersion: r.policyVersion };
  }
  return state;
}

export async function hasConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
  const state = await getConsentState(userId, [purpose]);
  return state[purpose]?.granted === true;
}

/** Full consent history for a user (privacy dashboard / data export). */
export async function listConsentHistory(userId: string): Promise<(typeof consentRecords.$inferSelect)[]> {
  return db.select().from(consentRecords).where(eq(consentRecords.userId, userId)).orderBy(desc(consentRecords.createdAt));
}
