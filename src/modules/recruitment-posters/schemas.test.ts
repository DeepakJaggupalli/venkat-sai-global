import { describe, expect, it } from "vitest";

import { cvSubmissionSchema } from "@/modules/operations/cv-submission-schemas";

import { parseLines, parseTradeLines, quickPosterSchema } from "./schemas";

describe("parseTradeLines", () => {
  it("splits trade and salary and keeps an upper-case currency code", () => {
    expect(parseTradeLines("Mechanical helper - 900 AED\n\n• Rigger: 1200 SAR\nWelder")).toEqual([
      { trade: "Mechanical helper", salary: "900 AED", currency: "AED" },
      { trade: "Rigger", salary: "1200 SAR", currency: "SAR" },
      { trade: "Welder" },
    ]);
  });

  it("never invents a currency", () => {
    expect(parseTradeLines("Helper - 900 + food allowance 350")).toEqual([{ trade: "Helper", salary: "900 + food allowance 350" }]);
    expect(parseTradeLines("Driver - 60 per day")).toEqual([{ trade: "Driver", salary: "60 per day" }]);
  });

  it("keeps hyphenated trade names whole", () => {
    expect(parseTradeLines("Pipe-fitter")).toEqual([{ trade: "Pipe-fitter" }]);
  });

  it("handles empty input and caps the list", () => {
    expect(parseTradeLines("")).toEqual([]);
    expect(parseTradeLines(Array.from({ length: 40 }, (_, i) => `Trade ${i}`).join("\n"))).toHaveLength(30);
    expect(parseLines(" - Free accommodation\nMedical\n", 20, 160)).toEqual(["Free accommodation", "Medical"]);
  });
});

describe("form schemas", () => {
  it("quick poster: only the file is required", () => {
    // Blank form fields arrive as undefined (formDataToObject).
    expect(quickPosterSchema.safeParse({ fileId: "8f8f8f8f-8f8f-4f8f-8f8f-8f8f8f8f8f8f", countryCode: "ae", applyBy: "" }).data).toMatchObject({ countryCode: "AE", applyBy: undefined });
    expect(quickPosterSchema.safeParse({}).success).toBe(false);
  });

  it("send CV: requires name, a valid phone, a trade and consent", () => {
    const ok = cvSubmissionSchema.safeParse({ name: "Ravi", phone: "98765 43210", trade: "other", tradeOther: "Rigger", consentToContact: "true", hasPassport: "no" });
    expect(ok.success && ok.data).toMatchObject({ phone: "+919876543210", hasPassport: false });
    const bad = cvSubmissionSchema.safeParse({ name: "", phone: "123", trade: "other", consentToContact: undefined });
    expect(bad.success).toBe(false);
    const keys = bad.error!.issues.map((i) => i.path.join("."));
    expect(keys).toEqual(expect.arrayContaining(["name", "phone", "consentToContact"]));
    const noTrade = cvSubmissionSchema.safeParse({ name: "Ravi", phone: "9876543210", trade: "other", consentToContact: "true" });
    expect(noTrade.error?.issues.map((i) => i.path.join("."))).toEqual(["tradeOther"]);
    expect(cvSubmissionSchema.safeParse({ name: "Ravi", phone: "9876543210", trade: "not-a-uuid", consentToContact: "true" }).success).toBe(false);
  });
});
