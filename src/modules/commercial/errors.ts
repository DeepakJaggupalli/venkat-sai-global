import "server-only";

import { ActionError } from "@/lib/actions";

/**
 * Error helpers for the commercial module. Drizzle wraps driver errors (DrizzleQueryError.cause), so the
 * SQLSTATE and constraint name are looked up along the `cause` chain.
 */
export type PgErrorInfo = { code: string | null; constraint: string | null };

export function pgErrorInfo(error: unknown): PgErrorInfo {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return { code: candidate.code, constraint: typeof candidate.constraint === "string" ? candidate.constraint : null };
    }
    current = candidate.cause;
  }
  return { code: null, constraint: null };
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const info = pgErrorInfo(error);
  return info.code === "23505" && (!constraint || info.constraint === constraint);
}

/** User-facing messages for the commercial constraints (docs/SCHEMA_NOTES.md §5). */
export const CONSTRAINT_MESSAGES: Readonly<Record<string, string>> = {
  plans_key_uq: "A plan with this key already exists.",
  plans_default_audience_uq: "Another plan is already the default for this audience. Unset it first.",
  plan_prices_active_uq: "The plan already has an active price for this currency and interval. Deactivate it first.",
  plan_features_plan_key_uq: "The plan already has a limit for this feature.",
  subscriptions_live_base_uq: "The organisation already has a live base plan. Change the plan instead.",
  coupons_code_uq: "A coupon with this code already exists.",
  coupons_redemptions_chk: "This coupon has reached its redemption limit.",
  coupon_redemptions_coupon_invoice_uq: "This coupon is already applied to the invoice.",
  tax_rates_definition_uq: "A rate of this kind already exists for this country, region, code and effective date.",
  payments_provider_ref_uq: "This payment has already been recorded.",
  refunds_provider_ref_uq: "This refund has already been recorded.",
  partner_settlements_period_uq: "A settlement for this partner, period and currency already exists.",
  partner_settlement_lines_placement_fee_uq: "This placement fee is already in another settlement.",
  billing_profiles_gstin_chk: "Enter a valid 15-character GSTIN.",
  billing_profiles_state_code_chk: "Enter the two-digit GST state code (for example 37 for Andhra Pradesh).",
};

/** Turn known constraint violations into ActionErrors; anything else is re-thrown unchanged. */
export function rethrowConstraint(error: unknown, extra: Readonly<Record<string, string>> = {}): never {
  const info = pgErrorInfo(error);
  const message = info.constraint ? (extra[info.constraint] ?? CONSTRAINT_MESSAGES[info.constraint]) : undefined;
  if (message) throw new ActionError(message, { code: info.constraint ?? undefined });
  throw error;
}

export function notFound(what: string): ActionError {
  return new ActionError(`${what} not found.`, { code: "not_found" });
}

export function forbidden(message = "You do not have permission to do this."): ActionError {
  return new ActionError(message, { code: "forbidden" });
}

export function invalidState(message: string): ActionError {
  return new ActionError(message, { code: "invalid_state" });
}

/** Raised by gateway clients for provider failures (message is safe to show; details are logged). */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly provider: "razorpay" | "stripe",
    public readonly status: number | null = null,
    public readonly providerCode: string | null = null,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
