import "server-only";

import type { ConsumeOptions, EntitlementCheck, EntitlementKey } from "./entitlements";

/**
 * TEMPORARY permissive implementation — replaced by the commercial module with real
 * plan/credit enforcement (see entitlements.ts for the contract). Keep the signatures.
 */
export async function checkEntitlement(_organizationId: string, _key: EntitlementKey): Promise<EntitlementCheck> {
  return { allowed: true, limit: null, used: 0, remaining: null, planName: null };
}

export async function consumeEntitlement(_organizationId: string, _key: EntitlementKey, _opts: ConsumeOptions): Promise<void> {
  return;
}
