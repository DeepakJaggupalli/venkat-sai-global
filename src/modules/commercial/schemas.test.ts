import { describe, expect, it } from "vitest";

import { offlinePaymentSchema, planFormSchema, staffStartSubscriptionSchema, taxRateFormSchema } from "./schemas";

const issuesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("record a payment form", () => {
  it("lists every missing field at once, and asks for the invoice before a currency", () => {
    const issues = issuesOf(offlinePaymentSchema.safeParse({ provider: "bank_transfer", receivedAt: "2026-11-20" }));
    expect(Object.keys(issues).sort()).toEqual(["amount", "externalReference", "invoiceId"]);
    expect(issues.invoiceId).toMatch(/Choose the invoice/);
  });

  it("asks for the currency of an advance payment", () => {
    const issues = issuesOf(
      offlinePaymentSchema.safeParse({ organizationId: "7f1f3c1e-2a8b-4c55-9a77-0d3f8e0f1a22", provider: "manual", amount: "500", receivedAt: "2026-11-20" }),
    );
    expect(issues).toEqual({ currency: "Choose a currency" });
  });

  it("accepts a payment against an invoice in the invoice's currency", () => {
    const parsed = offlinePaymentSchema.parse({
      invoiceId: "7f1f3c1e-2a8b-4c55-9a77-0d3f8e0f1a22",
      provider: "bank_transfer",
      amount: "1180",
      currency: "inr",
      externalReference: "UTR123",
      receivedAt: "2026-11-20",
    });
    expect(parsed).toMatchObject({ currency: "INR", externalReference: "UTR123" });
  });
});

describe("plain field messages", () => {
  it("says what to choose instead of 'Choose a valid option'", () => {
    expect(issuesOf(planFormSchema.safeParse({ key: "basic", name: "Basic" })).audience).toBe("Choose who the plan is for");
    expect(issuesOf(taxRateFormSchema.safeParse({ name: "CGST", countryCode: "IN", ratePercent: "9", effectiveFrom: "2026-04-01" })).kind).toBe("Choose the kind of tax");
  });

  it("asks staff for the organisation and the plan of a new subscription", () => {
    expect(issuesOf(staffStartSubscriptionSchema.safeParse({}))).toEqual({ organizationId: "Choose the organisation", planId: "Choose a plan" });
  });
});
