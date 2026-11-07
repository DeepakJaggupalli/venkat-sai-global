import { describe, expect, it } from "vitest";

import { encodeForm } from "./gateways/form";
import { computePlacementFee, resolveFeeTerms, settlementTotal, type PlacementForFee } from "./settlement-rules";

const placement = (extra: Partial<PlacementForFee> = {}): PlacementForFee => ({
  id: "p1",
  code: "VSG-PLC-000001",
  status: "joined",
  placedOn: "2026-08-01",
  joinedOn: "2026-08-15",
  salaryMinor: 250_000,
  salaryCurrency: "AED",
  salaryPeriod: "month",
  feeMinor: 1_500_000,
  feeCurrency: "INR",
  ...extra,
});

describe("partner settlement fee rules", () => {
  it("prefers assignment terms that name a model, else the agreement", () => {
    expect(resolveFeeTerms({ model: "percent_of_fee", percentBasisPoints: 1000 }, { feeModel: "flat_per_placement", amountMinor: 1, currency: "INR" })).toMatchObject({ source: "assignment", model: "percent_of_fee", basisPoints: 1000 });
    expect(resolveFeeTerms({}, { feeModel: "flat_per_placement", amountMinor: 500_000, currency: "inr", payableAfterJoiningDays: 30 })).toMatchObject({ source: "agreement", currency: "INR", payableAfterDays: 30 });
    expect(resolveFeeTerms({ model: "fixed_per_placement", amountMinor: 9, currency: "USD" }, null)).toMatchObject({ model: "flat_per_placement" });
    expect(resolveFeeTerms(null, null)).toBeNull();
  });

  it("pays a flat fee after the waiting period from joining, in the terms' currency", () => {
    const terms = resolveFeeTerms(null, { feeModel: "flat_per_placement", amountMinor: 500_000, currency: "INR", payableAfterJoiningDays: 30 });
    expect(computePlacementFee(placement(), terms, "2026-09-14")).toMatchObject({ ok: true, amountMinor: 500_000, currency: "INR", payableOn: "2026-09-14" });
    expect(computePlacementFee(placement(), terms, "2026-09-13")).toMatchObject({ ok: false, payableOn: "2026-09-14" });
    expect(computePlacementFee(placement({ status: "pending_joining", joinedOn: null }), terms, "2026-12-31")).toMatchObject({ ok: false });
    expect(computePlacementFee(placement({ status: "cancelled" }), terms, "2026-12-31")).toMatchObject({ ok: false });
  });

  it("pays selection fees from the placement date, percentages of the fee or of the annualised salary", () => {
    const selection = resolveFeeTerms(null, { feeModel: "flat_per_selection", amountMinor: 100_000, currency: "INR" });
    expect(computePlacementFee(placement({ status: "pending_joining", joinedOn: null }), selection, "2026-08-01")).toMatchObject({ ok: true, amountMinor: 100_000 });
    const pct = resolveFeeTerms({ model: "percent_of_fee", percentBasisPoints: 1250 }, null);
    expect(computePlacementFee(placement(), pct, "2026-12-31")).toMatchObject({ ok: true, amountMinor: 187_500, currency: "INR" });
    const salary = resolveFeeTerms(null, { feeModel: "salary_percentage", rateBasisPoints: 500 });
    // 2,500.00 AED / month × 12 × 5 % = 1,500.00 AED
    expect(computePlacementFee(placement(), salary, "2026-12-31")).toMatchObject({ ok: true, amountMinor: 150_000, currency: "AED" });
    expect(computePlacementFee(placement({ salaryPeriod: "hour" }), salary, "2026-12-31")).toMatchObject({ ok: false });
    expect(computePlacementFee(placement(), resolveFeeTerms(null, { feeModel: "custom" }), "2026-12-31")).toMatchObject({ ok: false });
    expect(computePlacementFee(placement(), resolveFeeTerms({ model: "none" }, null), "2026-12-31")).toMatchObject({ ok: false });
  });

  it("subtracts deductions and ignores voided lines", () => {
    expect(settlementTotal([{ kind: "placement_fee", amountMinor: 500 }, { kind: "bonus", amountMinor: 100 }, { kind: "deduction", amountMinor: 150 }, { kind: "placement_fee", amountMinor: 999, voidedAt: new Date() }])).toBe(450);
  });
});

describe("Stripe form encoding", () => {
  it("encodes nested objects and arrays like the Stripe SDKs", () => {
    const encoded = encodeForm({ mode: "payment", line_items: [{ quantity: 1, price_data: { currency: "inr", unit_amount: 118000 } }], metadata: { invoiceId: "a b" }, skip: undefined });
    expect(decodeURIComponent(encoded)).toBe("mode=payment&line_items[0][quantity]=1&line_items[0][price_data][currency]=inr&line_items[0][price_data][unit_amount]=118000&metadata[invoiceId]=a b");
    expect(encodeForm({ success_url: "https://x.test/s?session_id={CHECKOUT_SESSION_ID}" })).toBe("success_url=https%3A%2F%2Fx.test%2Fs%3Fsession_id%3D%7BCHECKOUT_SESSION_ID%7D");
  });
});
