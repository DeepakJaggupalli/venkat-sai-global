import type { EntitlementKey } from "./entitlements";

/**
 * Thrown by consumeEntitlement() when limits are enforced and the organisation has no allowance left.
 * Re-exported unchanged from "@/modules/commercial/entitlements" (the public contract); defined here so the
 * implementation can throw it without a circular import.
 */
export class EntitlementError extends Error {
  constructor(
    message: string,
    public readonly key: EntitlementKey,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}
