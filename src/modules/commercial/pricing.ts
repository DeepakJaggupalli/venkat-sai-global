/**
 * Invoice arithmetic (client-safe, pure): line amounts, coupon discounts, tax and totals in ONE currency.
 *
 * Totals satisfy the database checks exactly:
 *   line.amountMinor   = quantity × unitAmountMinor − line.discountMinor
 *   invoice.subtotal   = Σ quantity × unitAmountMinor
 *   invoice.discount   = Σ line.discountMinor            (coupon discounts are allocated to lines)
 *   invoice.tax        = Σ line.taxMinor                 (Σ of the line's rounded components)
 *   invoice.total      = subtotal − discount + tax
 *
 * Rounding (README → Rounding): tax per line and per component, half away from zero at the minor unit; the
 * invoice tax is the sum of the rounded components (never re-rounded). Tax-inclusive prices are converted to a
 * net amount first: net = round(gross ÷ (1 + rate)); a one-minor-unit difference is absorbed by the net amount
 * so net + tax equals the gross price exactly. Percent coupons are rounded half away from zero; fixed coupons
 * are capped at the pre-tax amount; the discount is allocated to lines by largest remainder.
 */
import type { CouponDiscountType, InvoiceLineTax } from "@/db/schema/commercial";

import { allocateProportionally, applyPercent, multiply, netFromGross, sum } from "./money";
import { computeLineTaxes, determineTaxTreatment, selectRates, type TaxContext, type TaxDetermination, TAX_KIND_LABELS } from "./tax";

export type PricingLineInput = {
  description: string;
  quantity: number;
  /** Unit price in minor units: net of tax, or gross when `taxInclusive`. */
  unitAmountMinor: number;
  /** Line discount in minor units (before any coupon). */
  discountMinor?: number;
  taxCode?: string | null;
  taxInclusive?: boolean;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type PricedLine = {
  description: string;
  quantity: number;
  unitAmountMinor: number;
  discountMinor: number;
  amountMinor: number;
  taxCode: string | null;
  taxRateBasisPoints: number;
  taxMinor: number;
  taxes: InvoiceLineTax[];
  referenceType: string | null;
  referenceId: string | null;
};

export type InvoiceTotals = { subtotalMinor: number; discountMinor: number; taxMinor: number; totalMinor: number };

export type CouponDiscount = { discountType: CouponDiscountType; percentOff: number | null; amountOffMinor: number | null };

export type PricingResult = {
  lines: PricedLine[];
  totals: InvoiceTotals;
  determination: TaxDetermination;
  /** Coupon discount actually applied (minor units), 0 without a coupon. */
  couponDiscountMinor: number;
  /** Must be resolved before the invoice can be issued (missing rates, missing place of supply…). */
  problems: string[];
};

function assertLine(line: PricingLineInput, index: number): void {
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new RangeError(`Line ${index + 1}: quantity must be a positive whole number`);
  if (!Number.isSafeInteger(line.unitAmountMinor) || line.unitAmountMinor < 0) throw new RangeError(`Line ${index + 1}: unit amount must not be negative`);
  const discount = line.discountMinor ?? 0;
  if (!Number.isSafeInteger(discount) || discount < 0) throw new RangeError(`Line ${index + 1}: discount must not be negative`);
  if (discount > multiply(line.unitAmountMinor, line.quantity)) throw new RangeError(`Line ${index + 1}: discount is larger than the line amount`);
}

/** Coupon discount on a pre-tax base (percent rounded half away from zero; fixed capped at the base). */
export function couponDiscountOn(baseMinor: number, coupon: CouponDiscount | null | undefined): number {
  if (!coupon || baseMinor <= 0) return 0;
  if (coupon.discountType === "percent") return Math.min(baseMinor, applyPercent(baseMinor, coupon.percentOff ?? 0));
  return Math.min(baseMinor, Math.max(0, coupon.amountOffMinor ?? 0));
}

/**
 * Price an invoice: tax treatment, per-line taxes, coupon allocation and totals.
 * Throws RangeError on structurally invalid lines (negative amounts, zero quantity).
 */
export function priceInvoice(inputLines: readonly PricingLineInput[], taxContext: TaxContext, coupon?: CouponDiscount | null): PricingResult {
  inputLines.forEach(assertLine);
  const determination = determineTaxTreatment(taxContext);
  const problems = [...determination.problems];

  // 1. Resolve components per line and convert tax-inclusive prices to net amounts.
  const staged = inputLines.map((line) => {
    const taxCode = line.taxCode?.trim() || null;
    const { components, missing } = selectRates(taxContext, determination, taxCode);
    if (missing.length) {
      const names = missing.map((k) => TAX_KIND_LABELS[k]).join(" + ");
      const problem = `No active ${names} rate is configured${taxCode ? ` for HSN/SAC ${taxCode}` : ""}${determination.rateCountry ? ` (${determination.rateCountry})` : ""}.`;
      if (!problems.includes(problem)) problems.push(problem);
    }
    const quantity = line.quantity;
    let unitAmountMinor = line.unitAmountMinor;
    let discountMinor = line.discountMinor ?? 0;
    let frozenTaxes: InvoiceLineTax[] | null = null;
    if (line.taxInclusive) {
      const gross = multiply(line.unitAmountMinor, line.quantity) - discountMinor;
      const totalBp = components.reduce((acc, c) => acc + c.rateBasisPoints, 0);
      const firstNet = netFromGross(gross, totalBp);
      // Components stay as computed on the first net amount; the net absorbs any rounding difference so that
      // net + Σ components = gross exactly.
      frozenTaxes = computeLineTaxes(firstNet, components);
      const net = gross - sum(frozenTaxes.map((t) => t.amountMinor));
      // Same quantity: unit rounded up, the remainder shown as a rounding discount (0 when divisible).
      unitAmountMinor = Number((BigInt(net) + BigInt(quantity) - BigInt(1)) / BigInt(quantity));
      discountMinor = multiply(unitAmountMinor, quantity) - net;
    }
    return { line, taxCode, components, quantity, unitAmountMinor, discountMinor, frozenTaxes };
  });

  // 2. Coupon on the pre-tax amounts, allocated to lines by largest remainder.
  const bases = staged.map((s) => multiply(s.unitAmountMinor, s.quantity) - s.discountMinor);
  const couponDiscountMinor = couponDiscountOn(sum(bases), coupon);
  const allocations = couponDiscountMinor > 0 ? allocateProportionally(couponDiscountMinor, bases) : bases.map(() => 0);

  // 3. Taxes on the discounted amounts and totals.
  const lines: PricedLine[] = staged.map((s, i) => {
    const allocated = allocations[i] ?? 0;
    const discountMinor = s.discountMinor + allocated;
    const amountMinor = multiply(s.unitAmountMinor, s.quantity) - discountMinor;
    const taxes = s.frozenTaxes && allocated === 0 ? s.frozenTaxes : computeLineTaxes(amountMinor, s.components);
    return {
      description: s.line.description,
      quantity: s.quantity,
      unitAmountMinor: s.unitAmountMinor,
      discountMinor,
      amountMinor,
      taxCode: s.taxCode,
      taxRateBasisPoints: taxes.reduce((acc, t) => acc + t.rateBasisPoints, 0),
      taxMinor: sum(taxes.map((t) => t.amountMinor)),
      taxes,
      referenceType: s.line.referenceType ?? null,
      referenceId: s.line.referenceId ?? null,
    };
  });

  return { lines, totals: totalsOf(lines), determination, couponDiscountMinor, problems };
}

/** Invoice totals from priced lines (see the identities at the top of this file). */
export function totalsOf(lines: readonly Pick<PricedLine, "quantity" | "unitAmountMinor" | "discountMinor" | "taxMinor">[]): InvoiceTotals {
  const subtotalMinor = sum(lines.map((l) => multiply(l.unitAmountMinor, l.quantity)));
  const discountMinor = sum(lines.map((l) => l.discountMinor));
  const taxMinor = sum(lines.map((l) => l.taxMinor));
  return { subtotalMinor, discountMinor, taxMinor, totalMinor: subtotalMinor - discountMinor + taxMinor };
}

/**
 * Scale an issued invoice's lines to a partial amount (credit note for a partial refund): the gross `amountMinor`
 * (tax-inclusive, ≤ invoice total) is split over the lines in proportion to their gross amounts, then each part
 * into net + tax components in proportion to the original line, so every figure adds up exactly.
 */
export function scaleLinesToAmount(
  lines: readonly Pick<PricedLine, "description" | "amountMinor" | "taxMinor" | "taxes" | "taxCode" | "referenceType" | "referenceId">[],
  amountMinor: number,
): PricedLine[] {
  const grossWeights = lines.map((l) => l.amountMinor + l.taxMinor);
  const parts = allocateProportionally(amountMinor, grossWeights);
  return lines.map((line, i) => {
    const part = parts[i] ?? 0;
    const gross = line.amountMinor + line.taxMinor;
    const split = gross > 0 ? allocateProportionally(part, [line.amountMinor, ...line.taxes.map((t) => t.amountMinor)]) : [part];
    const net = split[0] ?? 0;
    const taxes = line.taxes.map((t, j) => ({ ...t, amountMinor: split[j + 1] ?? 0 }));
    return {
      description: line.description,
      quantity: 1,
      unitAmountMinor: net,
      discountMinor: 0,
      amountMinor: net,
      taxCode: line.taxCode,
      taxRateBasisPoints: taxes.reduce((acc, t) => acc + t.rateBasisPoints, 0),
      taxMinor: sum(taxes.map((t) => t.amountMinor)),
      taxes,
      referenceType: line.referenceType,
      referenceId: line.referenceId,
    };
  });
}
