import { describe, expect, it } from "vitest";

import type { PlanPriceView } from "@/modules/commercial/types";

import { availableCurrencies, editorLinesPayload, monthStartIso, parseEditorLines, pickCurrency, pricesIn, usageLevel, usagePercent } from "./plan-utils";

const price = (over: Partial<PlanPriceView>): PlanPriceView => ({ id: "p", currency: "INR", interval: "month", amountMinor: 100, taxInclusive: false, isActive: true, ...over });

describe("currencies", () => {
  it("lists only currencies with active prices", () => {
    const plans = [{ prices: [price({ currency: "inr" }), price({ currency: "AED", isActive: false })] }, { prices: [price({ currency: "USD" })] }];
    expect(availableCurrencies(plans)).toEqual(["INR", "USD"]);
  });

  it("prefers the billing currency, never assumes one", () => {
    expect(pickCurrency(["AED", "USD"], [null, "usd"])).toBe("USD");
    expect(pickCurrency(["AED", "USD"], ["INR"])).toBe("AED");
    expect(pickCurrency([], ["INR"])).toBeNull();
  });

  it("orders prices by interval and filters by kind", () => {
    const plan = { prices: [price({ id: "y", interval: "year" }), price({ id: "o", interval: "one_time" }), price({ id: "m" }), price({ id: "u", currency: "USD" })] };
    expect(pricesIn(plan, "INR").map((p) => p.id)).toEqual(["m", "y", "o"]);
    expect(pricesIn(plan, "INR", { recurringOnly: true }).map((p) => p.id)).toEqual(["m", "y"]);
    expect(pricesIn(plan, "INR", { oneTimeOnly: true }).map((p) => p.id)).toEqual(["o"]);
    expect(pricesIn(plan, null)).toEqual([]);
  });
});

describe("usage", () => {
  it("computes clamped percentages", () => {
    expect(usagePercent(3, null)).toBeNull();
    expect(usagePercent(1, 4)).toBe(25);
    expect(usagePercent(9, 4)).toBe(100);
    expect(usagePercent(0, 0)).toBe(0);
    expect(usagePercent(1, 0)).toBe(100);
  });

  it("classifies levels", () => {
    expect(usageLevel(1, 10)).toBe("ok");
    expect(usageLevel(8, 10)).toBe("high");
    expect(usageLevel(10, 10)).toBe("full");
    expect(usageLevel(100, null)).toBe("ok");
  });
});

describe("invoice editor lines", () => {
  const row = (over: Partial<Record<"description" | "quantity" | "unitAmount" | "discount" | "taxCode", string>> = {}) => ({ description: "Trade test", quantity: "2", unitAmount: "1,250.50", discount: "", taxCode: "", ...over });

  it("parses decimals into minor units of the currency", () => {
    const { lines, errors } = parseEditorLines([row()], "INR");
    expect(errors).toEqual([null]);
    expect(lines[0]).toMatchObject({ quantity: 2, unitAmountMinor: 125050, discountMinor: 0 });
    expect(parseEditorLines([row({ unitAmount: "12.345" })], "KWD").lines[0]?.unitAmountMinor).toBe(12345);
    expect(parseEditorLines([row({ unitAmount: "500" })], "JPY").lines[0]?.unitAmountMinor).toBe(500);
  });

  it("rejects extra decimals, bad quantities, negatives and oversized discounts", () => {
    expect(parseEditorLines([row({ unitAmount: "1.005" })], "INR").errors[0]).toMatch(/decimal/);
    expect(parseEditorLines([row({ unitAmount: "1.5" })], "JPY").errors[0]).toMatch(/no decimal/);
    expect(parseEditorLines([row({ quantity: "1.5" })], "INR").errors[0]).toMatch(/whole number/);
    expect(parseEditorLines([row({ unitAmount: "-5" })], "INR").errors[0]).toMatch(/negative/);
    expect(parseEditorLines([row({ quantity: "1", unitAmount: "10", discount: "11" })], "INR").errors[0]).toMatch(/larger/);
    expect(parseEditorLines([row()], null).errors[0]).toMatch(/currency/);
  });

  it("skips blank rows", () => {
    const { lines, errors } = parseEditorLines([row({ description: "", unitAmount: "" }), row()], "INR");
    expect(errors).toEqual([null, null]);
    expect(lines).toHaveLength(1);
    expect(editorLinesPayload([row({ description: " ", unitAmount: "" }), row({ discount: "10", taxCode: "9985" })])).toEqual([
      { description: "Trade test", quantity: 2, unitAmount: "1,250.50", discount: "10", taxCode: "9985" },
    ]);
  });
});

it("computes month starts in UTC", () => {
  expect(monthStartIso(new Date("2026-03-15T10:00:00Z"), 0)).toBe("2026-03-01");
  expect(monthStartIso(new Date("2026-03-15T10:00:00Z"), 11)).toBe("2025-04-01");
});
