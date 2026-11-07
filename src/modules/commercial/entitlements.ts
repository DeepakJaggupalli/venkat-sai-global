import "server-only";

import type { DbOrTx } from "@/db";

/**
 * Plan entitlements & credits — CONTRACT. Implemented by the commercial module
 * (plans → plan_features limits, subscriptions, credit_ledger).
 *
 * Callers (employer portal, partner portal, institution portal):
 *   const ent = await checkEntitlement(orgId, "job_posts");
 *   if (!ent.allowed) -> show upgrade prompt (ent.reason)
 *   await consumeEntitlement(orgId, "candidate_unlocks", { reference: { type: "candidate", id }, actorUserId, tx });
 *
 * When the "commercial.enforce_limits" setting is OFF (default until Venkat Sai configures
 * plans), every check returns allowed=true and consumption is recorded for reporting only.
 * Candidates are never charged for discovering or applying to jobs.
 */
export const ENTITLEMENT_KEYS = [
  "job_posts", // active job postings
  "featured_jobs", // featured / promoted jobs
  "candidate_unlocks", // reveal candidate contact details
  "candidate_search", // access to candidate database search
  "team_seats", // organisation members
  "bulk_requirements", // bulk manpower requests per period
  "partner_submissions", // partner candidate submissions per period
  "courses", // institution courses
  "analytics_reports", // advanced reports
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export type EntitlementCheck = {
  allowed: boolean;
  /**
   * Whether limits are currently enforced ("commercial.enforce_limits"). When false, `allowed` is always true
   * and `limit` / `remaining` are informational only — callers must not apply their own limit checks.
   */
  enforced: boolean;
  /** null = unlimited */
  limit: number | null;
  used: number;
  remaining: number | null;
  reason?: string;
  planName?: string | null;
};

// Defined in ./entitlement-error.ts (no import cycle with the implementation); same class, same export.
export { EntitlementError } from "./entitlement-error";

export type ConsumeOptions = {
  quantity?: number;
  reference: { type: string; id: string };
  actorUserId?: string | null;
  tx?: DbOrTx;
};

export type EntitlementsApi = {
  checkEntitlement(organizationId: string, key: EntitlementKey): Promise<EntitlementCheck>;
  consumeEntitlement(organizationId: string, key: EntitlementKey, opts: ConsumeOptions): Promise<void>;
};

// The implementation lives in ./entitlements-impl.ts (owned by the commercial module) and is
// re-exported here so callers only ever import from "@/modules/commercial/entitlements".
export { checkEntitlement, consumeEntitlement } from "./entitlements-impl";
