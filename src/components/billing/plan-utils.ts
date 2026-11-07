/**
 * Pure helpers for billing UI (client-safe, unit-tested in plan-utils.test.ts).
 * Nothing here converts or compares amounts across currencies.
 */
import type { BillingInterval } from "@/db/schema/commercial";
import { minorUnitsFor, parseDecimalToMinor } from "@/modules/commercial/money";
import type { PricingLineInput } from "@/modules/commercial/pricing";
import type { PlanPriceView, PlanView } from "@/modules/commercial/types";

const INTERVAL_ORDER: Record<BillingInterval, number> = { month: 0, quarter: 1, year: 2, one_time: 3 };

/** Currencies in which at least one active price exists, alphabetically. */
export function availableCurrencies(plans: readonly Pick<PlanView, "prices">[]): string[] {
  const set = new Set<string>();
  for (const plan of plans) for (const price of plan.prices) if (price.isActive) set.add(price.currency.toUpperCase());
  return [...set].sort();
}

/**
 * The currency to show first: the first preferred currency (billing profile, current subscription) that has prices,
 * otherwise the first available one. Null when nothing is priced. Never falls back to an assumed currency.
 */
export function pickCurrency(available: readonly string[], preferred: readonly (string | null | undefined)[]): string | null {
  for (const p of preferred) {
    const code = p?.toUpperCase();
    if (code && available.includes(code)) return code;
  }
  return available[0] ?? null;
}

/** Active prices of a plan in one currency, ordered month → quarter → year → one-time. */
export function pricesIn(plan: Pick<PlanView, "prices">, currency: string | null, opts: { recurringOnly?: boolean; oneTimeOnly?: boolean } = {}): PlanPriceView[] {
  if (!currency) return [];
  return plan.prices
    .filter((p) => p.isActive && p.currency.toUpperCase() === currency.toUpperCase())
    .filter((p) => (opts.recurringOnly ? p.interval !== "one_time" : true))
    .filter((p) => (opts.oneTimeOnly ? p.interval === "one_time" : true))
    .sort((a, b) => INTERVAL_ORDER[a.interval] - INTERVAL_ORDER[b.interval] || a.amountMinor - b.amountMinor);
}

/** Share of a limit in use, 0–100, or null when unlimited / no limit. */
export function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

export type UsageLevel = "ok" | "high" | "full";

export function usageLevel(used: number, limit: number | null): UsageLevel {
  const pct = usagePercent(used, limit);
  if (pct === null) return "ok";
  if (pct >= 100) return "full";
  return pct >= 80 ? "high" : "ok";
}

/** A manual invoice line as typed in the editor (strings, like the form posts them). */
export type EditorLine = { description: string; quantity: string; unitAmount: string; discount: string; taxCode: string };

export type ParsedEditorLines = { lines: PricingLineInput[]; errors: (string | null)[] };

/**
 * Converts editor rows into pricing input for the live tax preview, using the same decimal rules as the service
 * (extra decimals are rejected, never rounded). Blank rows are skipped; invalid rows get an error message.
 */
export function parseEditorLines(rows: readonly EditorLine[], currency: string | null): ParsedEditorLines {
  const errors: (string | null)[] = [];
  const lines: PricingLineInput[] = [];
  const minor = currency ? minorUnitsFor(currency) : 2;
  rows.forEach((row) => {
    const blank = !row.description.trim() && !row.unitAmount.trim();
    if (blank) {
      errors.push(null);
      return;
    }
    if (!currency) {
      errors.push("Choose a currency");
      return;
    }
    const quantity = Number.parseInt(row.quantity, 10);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || String(quantity) !== row.quantity.trim()) {
      errors.push("Quantity must be a whole number of at least 1");
      return;
    }
    const unit = parseDecimalToMinor(row.unitAmount.replace(/[,_ ]/g, "") || "", minor);
    if (!unit.ok) {
      errors.push(`Unit price: ${unit.error}`);
      return;
    }
    if (unit.minor < 0) {
      errors.push("Unit price cannot be negative");
      return;
    }
    let discountMinor = 0;
    if (row.discount.trim()) {
      const d = parseDecimalToMinor(row.discount.replace(/[,_ ]/g, ""), minor);
      if (!d.ok) {
        errors.push(`Discount: ${d.error}`);
        return;
      }
      discountMinor = d.minor;
    }
    if (discountMinor > unit.minor * quantity) {
      errors.push("The discount is larger than the line amount");
      return;
    }
    errors.push(null);
    lines.push({ description: row.description.trim() || "—", quantity, unitAmountMinor: unit.minor, discountMinor, taxCode: row.taxCode.trim() || null });
  });
  return { lines, errors };
}

/** Editor rows → the `lines:json` payload expected by manualInvoiceSchema (blank rows dropped). */
export function editorLinesPayload(rows: readonly EditorLine[]): { description: string; quantity: number; unitAmount: string; discount?: string; taxCode?: string }[] {
  return rows
    .filter((r) => r.description.trim() || r.unitAmount.trim())
    .map((r) => ({
      description: r.description.trim(),
      quantity: Number.parseInt(r.quantity, 10) || 0,
      unitAmount: r.unitAmount.trim(),
      ...(r.discount.trim() ? { discount: r.discount.trim() } : {}),
      ...(r.taxCode.trim() ? { taxCode: r.taxCode.trim() } : {}),
    }));
}

/** First day of the month `monthsBack` months before `now`, as an ISO date (UTC). */
export function monthStartIso(now: Date, monthsBack: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  return d.toISOString().slice(0, 10);
}
