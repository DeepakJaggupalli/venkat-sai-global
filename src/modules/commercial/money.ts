/**
 * Exact money arithmetic on integer minor units (client-safe, pure).
 *
 * Every amount is an integer number of the currency's minor unit (paise, cents, fils, yen…) next to its ISO
 * 4217 code. Functions here never mix currencies: callers pass amounts of ONE currency. Products such as
 * amount × basis points use BigInt so large invoices cannot lose precision.
 *
 * Rounding rule (documented in README → Rounding): half away from zero, at the minor unit.
 */

export const BASIS_POINTS = 10_000;

// BigInt constants (the TypeScript target predates BigInt literals).
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** Integer division rounded half away from zero (denominator > 0). */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= ZERO) throw new RangeError("denominator must be positive");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === ZERO) return quotient;
  const twice = (remainder < ZERO ? -remainder : remainder) * TWO;
  if (twice >= denominator) return numerator < ZERO ? quotient - ONE : quotient + ONE;
  return quotient;
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Amount is outside the supported range");
  }
  return Number(value);
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer (minor units)`);
}

/** amountMinor × basisPoints / 10 000, rounded half away from zero (e.g. 18 % = 1800). */
export function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertInteger(amountMinor, "amountMinor");
  assertInteger(basisPoints, "basisPoints");
  return toSafeNumber(roundDiv(BigInt(amountMinor) * BigInt(basisPoints), BigInt(BASIS_POINTS)));
}

/** Percentage given in whole percent (1–100) of an amount, rounded half away from zero. */
export function applyPercent(amountMinor: number, percent: number): number {
  return applyBasisPoints(amountMinor, Math.round(percent * 100));
}

/**
 * Net amount contained in a tax-inclusive gross amount for a total rate in basis points:
 * round(gross × 10 000 / (10 000 + rate)).
 */
export function netFromGross(grossMinor: number, totalBasisPoints: number): number {
  assertInteger(grossMinor, "grossMinor");
  assertInteger(totalBasisPoints, "totalBasisPoints");
  return toSafeNumber(roundDiv(BigInt(grossMinor) * BigInt(BASIS_POINTS), BigInt(BASIS_POINTS + totalBasisPoints)));
}

/** quantity × unit amount (exact). */
export function multiply(unitAmountMinor: number, quantity: number): number {
  assertInteger(unitAmountMinor, "unitAmountMinor");
  assertInteger(quantity, "quantity");
  return toSafeNumber(BigInt(unitAmountMinor) * BigInt(quantity));
}

export function sum(values: readonly number[]): number {
  let total = ZERO;
  for (const v of values) {
    assertInteger(v, "amount");
    total += BigInt(v);
  }
  return toSafeNumber(total);
}

/**
 * Split `total` across `weights` proportionally with the largest-remainder method, so the parts are integers
 * that add up to exactly `total`. Weights are non-negative; with all-zero weights everything goes to the first
 * entry. Ties on the remainder go to the earlier entry (deterministic).
 */
export function allocateProportionally(total: number, weights: readonly number[]): number[] {
  assertInteger(total, "total");
  if (weights.length === 0) {
    if (total !== 0) throw new RangeError("Cannot allocate a non-zero amount over no weights");
    return [];
  }
  const weightSum = weights.reduce((acc, w) => {
    assertInteger(w, "weight");
    if (w < 0) throw new RangeError("Weights must not be negative");
    return acc + BigInt(w);
  }, ZERO);
  if (weightSum === ZERO) return weights.map((_, i) => (i === 0 ? total : 0));
  const sign = total < 0 ? -ONE : ONE;
  const absTotal = BigInt(Math.abs(total));
  const shares = weights.map((w, index) => {
    const exact = absTotal * BigInt(w);
    return { index, floor: exact / weightSum, remainder: exact % weightSum };
  });
  let allocated = shares.reduce((acc, s) => acc + s.floor, ZERO);
  const order = [...shares].sort((a, b) => (b.remainder === a.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1));
  for (const share of order) {
    if (allocated >= absTotal) break;
    share.floor += ONE;
    allocated += ONE;
  }
  return shares.map((s) => toSafeNumber(s.floor * sign));
}

/** Number of decimals allowed for a currency, from the currencies table or Intl (fallback 2). */
export function minorUnitsFor(currency: string, known?: number | null): number {
  if (typeof known === "number" && Number.isInteger(known) && known >= 0 && known <= 4) return known;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export type ParsedAmount = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Parse a decimal amount typed by a person ("1,250.50", "12.345", "1000") into minor units WITHOUT floating
 * point. More decimals than the currency has are rejected rather than rounded (a typo should not silently
 * change money). Thousands separators (",", "_", spaces) are ignored.
 */
export function parseDecimalToMinor(input: string | number, minorUnits: number): ParsedAmount {
  const raw = typeof input === "number" ? (Number.isFinite(input) ? String(input) : "") : input;
  const cleaned = raw.trim().replace(/[\s,_]/g, "");
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return { ok: false, error: "Enter an amount such as 1250.50" };
  const [, minus, whole, fraction = ""] = match;
  const trimmedFraction = fraction.replace(/0+$/, "");
  if (trimmedFraction.length > minorUnits) {
    return { ok: false, error: minorUnits === 0 ? "This currency has no decimal places" : `Use at most ${minorUnits} decimal places for this currency` };
  }
  const value = BigInt(whole!) * TEN ** BigInt(minorUnits) + BigInt((trimmedFraction.padEnd(minorUnits, "0") || "0"));
  const signed = minus ? -value : value;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return { ok: false, error: "Amount is too large" };
  return { ok: true, minor: Number(signed) };
}

/** Minor units → plain decimal string with the currency's decimals ("1250.50", "12.345", "1000"). */
export function formatMinorPlain(amountMinor: number, minorUnits: number): string {
  assertInteger(amountMinor, "amountMinor");
  const negative = amountMinor < 0;
  const digits = String(Math.abs(amountMinor)).padStart(minorUnits + 1, "0");
  const whole = minorUnits > 0 ? digits.slice(0, -minorUnits) : digits;
  const fraction = minorUnits > 0 ? `.${digits.slice(-minorUnits)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}
