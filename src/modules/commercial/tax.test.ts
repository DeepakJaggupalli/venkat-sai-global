import { describe, expect, it } from "vitest";

import { determineTaxTreatment, formatRate, selectRates, summarizeTaxes, type TaxContext, type TaxRateRecord } from "./tax";
import { priceInvoice } from "./pricing";

const FROM = new Date("2017-07-01T00:00:00Z");
const AT = new Date("2026-11-07T10:00:00Z");

function rate(partial: Partial<TaxRateRecord> & Pick<TaxRateRecord, "id" | "kind" | "rateBasisPoints" | "countryCode">): TaxRateRecord {
  return { name: partial.id, region: null, taxCode: null, isActive: true, effectiveFrom: FROM, effectiveUntil: null, ...partial };
}

/** India GST services rates as seeded (SAC 9985) + a UAE VAT rate. */
const RATES: TaxRateRecord[] = [
  rate({ id: "cgst", name: "CGST 9%", kind: "gst_cgst", rateBasisPoints: 900, countryCode: "IN", taxCode: "9985" }),
  rate({ id: "sgst", name: "SGST 9%", kind: "gst_sgst", rateBasisPoints: 900, countryCode: "IN", taxCode: "9985" }),
  rate({ id: "igst", name: "IGST 18%", kind: "gst_igst", rateBasisPoints: 1800, countryCode: "IN", taxCode: "9985" }),
  rate({ id: "ae-vat", name: "VAT 5%", kind: "vat", rateBasisPoints: 500, countryCode: "AE" }),
];

const SELLER = { countryCode: "IN", stateCode: "37", taxId: "37ABCDE1234F1Z5" };

function ctx(buyer: Partial<TaxContext["buyer"]>, extra: Partial<TaxContext> = {}): TaxContext {
  return {
    seller: SELLER,
    buyer: { countryCode: "IN", stateCode: "37", taxExempt: false, ...buyer },
    rates: RATES,
    at: AT,
    exportZeroRated: true,
    ...extra,
  };
}

const LINE = { description: "Recruitment services", quantity: 1, unitAmountMinor: 100_000, taxCode: "9985" };

describe("tax treatment", () => {
  it("intra-state supply (seller and buyer in Andhra Pradesh) → CGST + SGST split of 18 %", () => {
    const d = determineTaxTreatment(ctx({ stateCode: "37" }));
    expect(d).toMatchObject({ treatment: "standard", supply: "intra_state", kinds: ["gst_cgst", "gst_sgst"], placeOfSupply: "37", problems: [] });
    const priced = priceInvoice([LINE], ctx({ stateCode: "37" }));
    expect(priced.lines[0]!.taxes.map((t) => [t.kind, t.rateBasisPoints, t.amountMinor])).toEqual([
      ["gst_cgst", 900, 9_000],
      ["gst_sgst", 900, 9_000],
    ]);
    expect(priced.totals).toEqual({ subtotalMinor: 100_000, discountMinor: 0, taxMinor: 18_000, totalMinor: 118_000 });
  });

  it("inter-state supply (buyer in Telangana) → IGST 18 %", () => {
    const priced = priceInvoice([LINE], ctx({ stateCode: "36" }));
    expect(priced.determination).toMatchObject({ supply: "inter_state", kinds: ["gst_igst"], placeOfSupply: "36" });
    expect(priced.lines[0]!.taxes).toEqual([{ kind: "gst_igst", name: "IGST 18%", rateBasisPoints: 1800, amountMinor: 18_000, taxRateId: "igst" }]);
    expect(priced.totals.totalMinor).toBe(118_000);
  });

  it("buyer outside India without local rates → zero-rated export of services", () => {
    const priced = priceInvoice([LINE], ctx({ countryCode: "SA", stateCode: null }));
    expect(priced.determination).toMatchObject({ treatment: "export", supply: "export", kinds: [], placeOfSupply: "SA" });
    expect(priced.determination.note).toMatch(/zero-rated/);
    expect(priced.totals).toEqual({ subtotalMinor: 100_000, discountMinor: 0, taxMinor: 0, totalMinor: 100_000 });
    expect(priced.problems).toEqual([]);
  });

  it("export zero-rating switched off → IGST with place of supply 96 (foreign country)", () => {
    const priced = priceInvoice([LINE], ctx({ countryCode: "SA", stateCode: null }, { exportZeroRated: false }));
    expect(priced.determination).toMatchObject({ treatment: "standard", supply: "inter_state", placeOfSupply: "96" });
    expect(priced.totals.taxMinor).toBe(18_000);
  });

  it("other countries use the rates configured for the buyer's country (UAE VAT 5 %)", () => {
    const priced = priceInvoice([{ ...LINE, taxCode: null }], ctx({ countryCode: "AE", stateCode: null }));
    expect(priced.determination).toMatchObject({ treatment: "standard", supply: "foreign", rateCountry: "AE", placeOfSupply: "AE" });
    expect(priced.lines[0]!.taxes.map((t) => [t.kind, t.amountMinor])).toEqual([["vat", 5_000]]);
  });

  it("tax-exempt buyers and staff-chosen treatments charge no tax", () => {
    expect(determineTaxTreatment(ctx({ taxExempt: true }))).toMatchObject({ treatment: "exempt", kinds: [] });
    expect(determineTaxTreatment(ctx({}, { treatmentOverride: "sez" }))).toMatchObject({ treatment: "sez", kinds: [] });
    expect(determineTaxTreatment(ctx({}, { treatmentOverride: "reverse_charge" })).note).toMatch(/reverse charge/);
  });

  it("an Indian seller without a GSTIN does not collect GST", () => {
    const d = determineTaxTreatment(ctx({}, { seller: { ...SELLER, taxId: "" } }));
    expect(d).toMatchObject({ treatment: "out_of_scope", kinds: [] });
    expect(d.note).toMatch(/not registered/);
  });

  it("reports a missing buyer state code as a problem instead of guessing", () => {
    const priced = priceInvoice([LINE], ctx({ stateCode: null }));
    expect(priced.problems.join(" ")).toMatch(/state code/);
    expect(priced.totals.taxMinor).toBe(0);
  });

  it("reports missing rate configuration", () => {
    const priced = priceInvoice([LINE], ctx({ stateCode: "36" }, { rates: RATES.filter((r) => r.kind !== "gst_igst") }));
    expect(priced.problems.join(" ")).toMatch(/No active IGST rate/);
  });

  it("prefers the rate for the line's SAC code, then the latest effective rate", () => {
    const rates = [
      ...RATES,
      rate({ id: "igst-generic", kind: "gst_igst", rateBasisPoints: 1200, countryCode: "IN" }),
      rate({ id: "igst-9992", kind: "gst_igst", rateBasisPoints: 500, countryCode: "IN", taxCode: "9992" }),
      rate({ id: "igst-old", kind: "gst_igst", rateBasisPoints: 1500, countryCode: "IN", taxCode: "9985", effectiveFrom: new Date("2010-01-01Z"), effectiveUntil: FROM }),
    ];
    const c = ctx({ stateCode: "36" }, { rates });
    const d = determineTaxTreatment(c);
    expect(selectRates(c, d, "9985").components.map((r) => r.id)).toEqual(["igst"]);
    expect(selectRates(c, d, "9992").components.map((r) => r.id)).toEqual(["igst-9992"]);
    expect(selectRates(c, d, "9983").components.map((r) => r.id)).toEqual(["igst-generic"]);
    expect(selectRates({ ...c, at: new Date("2015-01-01Z") }, d, "9985").components.map((r) => r.id)).toEqual(["igst-old"]);
  });

  it("ignores inactive and expired rates", () => {
    const rates = RATES.map((r) => (r.id === "igst" ? { ...r, isActive: false } : r));
    expect(priceInvoice([LINE], ctx({ stateCode: "36" }, { rates })).problems.join(" ")).toMatch(/IGST/);
  });

  it("summarises the tax breakdown per component", () => {
    const priced = priceInvoice(
      [LINE, { description: "Trade test", quantity: 3, unitAmountMinor: 250_050, taxCode: "9985" }],
      ctx({ stateCode: "37" }),
    );
    const summary = summarizeTaxes(priced.lines);
    expect(summary.map((s) => [s.kind, s.taxableMinor, s.amountMinor])).toEqual([
      ["gst_cgst", 850_150, 9_000 + 67_514],
      ["gst_sgst", 850_150, 9_000 + 67_514],
    ]);
    expect(formatRate(900)).toBe("9%");
    expect(formatRate(1250)).toBe("12.5%");
  });
});
