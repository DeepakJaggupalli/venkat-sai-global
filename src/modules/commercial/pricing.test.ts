import { describe, expect, it } from "vitest";

import { allocateProportionally, applyBasisPoints, formatMinorPlain, minorUnitsFor, netFromGross, parseDecimalToMinor, roundDiv } from "./money";
import { couponDiscountOn, priceInvoice, scaleLinesToAmount, totalsOf, type PricingLineInput } from "./pricing";
import type { TaxContext, TaxRateRecord } from "./tax";

const FROM = new Date("2017-07-01T00:00:00Z");
const rates: TaxRateRecord[] = [
  { id: "cgst", name: "CGST 9%", countryCode: "IN", region: null, kind: "gst_cgst", rateBasisPoints: 900, taxCode: null, isActive: true, effectiveFrom: FROM, effectiveUntil: null },
  { id: "sgst", name: "SGST 9%", countryCode: "IN", region: null, kind: "gst_sgst", rateBasisPoints: 900, taxCode: null, isActive: true, effectiveFrom: FROM, effectiveUntil: null },
  { id: "igst", name: "IGST 18%", countryCode: "IN", region: null, kind: "gst_igst", rateBasisPoints: 1800, taxCode: null, isActive: true, effectiveFrom: FROM, effectiveUntil: null },
  { id: "kw-vat", name: "VAT 5%", countryCode: "KW", region: null, kind: "vat", rateBasisPoints: 500, taxCode: null, isActive: true, effectiveFrom: FROM, effectiveUntil: null },
  { id: "jp-ct", name: "Consumption tax 10%", countryCode: "JP", region: null, kind: "vat", rateBasisPoints: 1000, taxCode: null, isActive: true, effectiveFrom: FROM, effectiveUntil: null },
];
const seller = { countryCode: "IN", stateCode: "37", taxId: "37ABCDE1234F1Z5" };
const at = new Date("2026-11-07T00:00:00Z");
const intraState: TaxContext = { seller, buyer: { countryCode: "IN", stateCode: "37", taxExempt: false }, rates, at, exportZeroRated: true };
const interState: TaxContext = { ...intraState, buyer: { countryCode: "IN", stateCode: "29", taxExempt: false } };
const kuwait: TaxContext = { ...intraState, buyer: { countryCode: "KW", stateCode: null, taxExempt: false } };
const japan: TaxContext = { ...intraState, buyer: { countryCode: "JP", stateCode: null, taxExempt: false } };

function minor(value: string, currency: string): number {
  const parsed = parseDecimalToMinor(value, minorUnitsFor(currency));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.minor;
}

describe("money helpers", () => {
  it("rounds half away from zero", () => {
    expect(roundDiv(BigInt(5), BigInt(2))).toBe(BigInt(3));
    expect(roundDiv(BigInt(-5), BigInt(2))).toBe(BigInt(-3));
    expect(roundDiv(BigInt(4), BigInt(3))).toBe(BigInt(1));
    expect(applyBasisPoints(17_999, 900)).toBe(1_620); // 1619.91
    expect(applyBasisPoints(50, 900)).toBe(5); // 4.5 → 5
    expect(applyBasisPoints(9_007_199_254_740, 1800)).toBe(1_621_295_865_853); // BigInt path, no precision loss
  });

  it("knows the minor units of INR (2), KWD (3) and JPY (0)", () => {
    expect([minorUnitsFor("INR"), minorUnitsFor("KWD"), minorUnitsFor("JPY")]).toEqual([2, 3, 0]);
    expect(minorUnitsFor("XYZ", 3)).toBe(3);
  });

  it("parses typed amounts exactly and rejects extra decimals", () => {
    expect(parseDecimalToMinor("1,250.50", 2)).toEqual({ ok: true, minor: 125_050 });
    expect(parseDecimalToMinor("0.1", 2)).toEqual({ ok: true, minor: 10 });
    expect(parseDecimalToMinor("12.345", 3)).toEqual({ ok: true, minor: 12_345 });
    expect(parseDecimalToMinor("1500", 0)).toEqual({ ok: true, minor: 1_500 });
    expect(parseDecimalToMinor("1500.00", 0)).toEqual({ ok: true, minor: 1_500 });
    expect(parseDecimalToMinor("10.005", 2).ok).toBe(false);
    expect(parseDecimalToMinor("12.5", 0).ok).toBe(false);
    expect(parseDecimalToMinor("abc", 2).ok).toBe(false);
    expect(formatMinorPlain(125_050, 2)).toBe("1250.50");
    expect(formatMinorPlain(5, 3)).toBe("0.005");
    expect(formatMinorPlain(1500, 0)).toBe("1500");
  });

  it("allocates by largest remainder so the parts add up exactly", () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(10, [0, 0])).toEqual([10, 0]);
    expect(allocateProportionally(7, [100, 200, 300])).toEqual([1, 2, 4]);
    const parts = allocateProportionally(99_999, [12_345, 67_890, 11]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(99_999);
  });
});

describe("invoice totals across currencies", () => {
  it("INR (2 decimals): per-line, per-component rounding; totals identity holds", () => {
    const lines: PricingLineInput[] = [
      { description: "Annual plan", quantity: 1, unitAmountMinor: minor("999.99", "INR") },
      { description: "Unlock pack", quantity: 3, unitAmountMinor: minor("333.33", "INR") },
    ];
    const priced = priceInvoice(lines, intraState);
    // 99,999 × 9 % = 8,999.91 → 9,000 per component; 99,999 × 9 % again for SGST.
    expect(priced.lines[0]!.taxes.map((t) => t.amountMinor)).toEqual([9_000, 9_000]);
    // 3 × 33,333 = 99,999 → same.
    expect(priced.lines[1]!.amountMinor).toBe(99_999);
    expect(priced.totals).toEqual({ subtotalMinor: 199_998, discountMinor: 0, taxMinor: 36_000, totalMinor: 235_998 });
    expect(formatMinorPlain(priced.totals.totalMinor, 2)).toBe("2359.98");
  });

  it("KWD (3 decimals): fils are the minor unit", () => {
    const priced = priceInvoice([{ description: "Trade test", quantity: 2, unitAmountMinor: minor("12.345", "KWD") }], kuwait);
    // 24.690 KWD × 5 % = 1.2345 → 1.235 (half away from zero at the fil)
    expect(priced.lines[0]!.taxMinor).toBe(1_235);
    expect(priced.totals).toEqual({ subtotalMinor: 24_690, discountMinor: 0, taxMinor: 1_235, totalMinor: 25_925 });
    expect(formatMinorPlain(priced.totals.totalMinor, 3)).toBe("25.925");
  });

  it("JPY (0 decimals): tax rounds to whole yen", () => {
    const priced = priceInvoice([{ description: "Placement fee", quantity: 1, unitAmountMinor: minor("12345", "JPY") }], japan);
    // 12,345 × 10 % = 1,234.5 → 1,235
    expect(priced.totals).toEqual({ subtotalMinor: 12_345, discountMinor: 0, taxMinor: 1_235, totalMinor: 13_580 });
    expect(formatMinorPlain(priced.totals.totalMinor, 0)).toBe("13580");
  });

  it("tax-inclusive prices: net + tax equals the gross price exactly", () => {
    for (const gross of [1_000, 99_999, 118_000, 7, 100_001]) {
      const priced = priceInvoice([{ description: "Inclusive", quantity: 1, unitAmountMinor: gross, taxInclusive: true }], intraState);
      expect(priced.totals.totalMinor).toBe(gross);
      expect(priced.lines[0]!.amountMinor + priced.lines[0]!.taxMinor).toBe(gross);
    }
    expect(netFromGross(118_000, 1800)).toBe(100_000);
    const qty = priceInvoice([{ description: "Inclusive × 3", quantity: 3, unitAmountMinor: 1_000, taxInclusive: true }], interState);
    expect(qty.totals.totalMinor).toBe(3_000);
    expect(qty.lines[0]!.quantity).toBe(3);
  });

  it("coupons: percent rounded half up on the pre-tax amount, allocated to lines, taxed after discount", () => {
    expect(couponDiscountOn(99_999, { discountType: "percent", percentOff: 15, amountOffMinor: null })).toBe(15_000); // 14,999.85
    expect(couponDiscountOn(500, { discountType: "fixed", percentOff: null, amountOffMinor: 1_000 })).toBe(500);
    const priced = priceInvoice(
      [
        { description: "A", quantity: 1, unitAmountMinor: 10_000 },
        { description: "B", quantity: 1, unitAmountMinor: 20_000 },
      ],
      interState,
      { discountType: "percent", percentOff: 10, amountOffMinor: null },
    );
    expect(priced.couponDiscountMinor).toBe(3_000);
    expect(priced.lines.map((l) => [l.discountMinor, l.amountMinor, l.taxMinor])).toEqual([
      [1_000, 9_000, 1_620],
      [2_000, 18_000, 3_240],
    ]);
    expect(priced.totals).toEqual({ subtotalMinor: 30_000, discountMinor: 3_000, taxMinor: 4_860, totalMinor: 31_860 });
    expect(totalsOf(priced.lines)).toEqual(priced.totals);
  });

  it("rejects structurally invalid lines", () => {
    expect(() => priceInvoice([{ description: "x", quantity: 0, unitAmountMinor: 1 }], intraState)).toThrow(RangeError);
    expect(() => priceInvoice([{ description: "x", quantity: 1, unitAmountMinor: -1 }], intraState)).toThrow(RangeError);
    expect(() => priceInvoice([{ description: "x", quantity: 1, unitAmountMinor: 10, discountMinor: 11 }], intraState)).toThrow(RangeError);
  });

  it("scales lines for a partial credit note without losing a minor unit", () => {
    const priced = priceInvoice(
      [
        { description: "A", quantity: 1, unitAmountMinor: 33_333 },
        { description: "B", quantity: 2, unitAmountMinor: 11_111 },
      ],
      intraState,
    );
    const credit = scaleLinesToAmount(priced.lines, 25_000);
    const totals = totalsOf(credit);
    expect(totals.totalMinor).toBe(25_000);
    for (const line of credit) expect(line.taxMinor).toBe(line.taxes.reduce((a, t) => a + t.amountMinor, 0));
    expect(totalsOf(scaleLinesToAmount(priced.lines, priced.totals.totalMinor)).totalMinor).toBe(priced.totals.totalMinor);
  });
});
