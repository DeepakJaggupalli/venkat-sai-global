import { describe, expect, it } from "vitest";

import {
  cvSubmissionFiltersSchema,
  cvSubmissionSchema,
  maskPassportLast4,
  normaliseReferralCode,
  OTHER_TRADE,
  posterTradeOptions,
  totalExperienceYears,
} from "./cv-submission-schemas";

const TRADE_ID = "6f1d3c2e-8a4b-4c5d-9e7f-1a2b3c4d5e6f";
const base = { name: "Ravi Kumar", phone: "98765 43210", trade: TRADE_ID, consentToContact: "true" };

describe("quick apply schema", () => {
  it("needs only name, mobile number and trade", () => {
    const v = cvSubmissionSchema.parse(base);
    expect(v).toMatchObject({ name: "Ravi Kumar", phone: "+919876543210", trade: TRADE_ID });
    expect(v.referralCode).toBeUndefined();
    expect(v.email).toBeUndefined();
    expect(v.experienceAbroadYears).toBeUndefined();
    expect(v.experienceIndiaYears).toBeUndefined();
  });

  it("reports the three required fields in plain words", () => {
    const r = cvSubmissionSchema.safeParse({ consentToContact: "true" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "phone", "trade"]));
  });

  it("trims and lower-cases the email and rejects a broken one", () => {
    expect(cvSubmissionSchema.parse({ ...base, email: "  Ravi.Kumar@Example.COM " }).email).toBe("ravi.kumar@example.com");
    expect(cvSubmissionSchema.parse({ ...base, email: "" }).email).toBeUndefined();
    const bad = cvSubmissionSchema.safeParse({ ...base, email: "ravi@" });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0]!.path).toEqual(["email"]);
  });

  it("accepts experience abroad and in India as whole years from 0 to 60", () => {
    const v = cvSubmissionSchema.parse({ ...base, experienceAbroadYears: " 5 ", experienceIndiaYears: "0" });
    expect(v).toMatchObject({ experienceAbroadYears: 5, experienceIndiaYears: 0 });
    for (const bad of ["61", "-1", "2.5", "five"]) {
      const r = cvSubmissionSchema.safeParse({ ...base, experienceAbroadYears: bad });
      expect(r.success, bad).toBe(false);
      expect(r.error!.issues[0]!.path).toEqual(["experienceAbroadYears"]);
    }
  });

  it("keeps a valid referral code (upper-cased) and silently drops anything else", () => {
    expect(cvSubmissionSchema.parse({ ...base, referralCode: " ab12cd " }).referralCode).toBe("AB12CD");
    expect(cvSubmissionSchema.parse({ ...base, referralCode: "bad code!" }).referralCode).toBeUndefined();
    expect(cvSubmissionSchema.parse({ ...base, referralCode: "ABC" }).referralCode).toBeUndefined();
    expect(normaliseReferralCode("x".repeat(17))).toBeNull();
    expect(normaliseReferralCode(42)).toBeNull();
    expect(normaliseReferralCode("refer2025")).toBe("REFER2025");
  });

  it("turns a poster trade that is not a job category into an Other trade with that text", () => {
    const v = cvSubmissionSchema.parse({ ...base, trade: "other:Mechanical helper" });
    expect(v).toMatchObject({ trade: OTHER_TRADE, tradeOther: "Mechanical helper" });
    // A typed trade wins over the poster text.
    expect(cvSubmissionSchema.parse({ ...base, trade: "other:Helper", tradeOther: "Scaffolder" }).tradeOther).toBe("Scaffolder");
    expect(cvSubmissionSchema.safeParse({ ...base, trade: "other:" }).success).toBe(false);
    expect(cvSubmissionSchema.safeParse({ ...base, trade: "not-a-trade" }).success).toBe(false);
  });

  it("still accepts the older single experience figure and passport question", () => {
    const v = cvSubmissionSchema.parse({ ...base, experienceYears: "7", hasPassport: "no" });
    expect(v).toMatchObject({ experienceYears: 7, hasPassport: false });
  });
});

describe("helpers", () => {
  it("adds experience abroad and in India for matching (capped at 60), else keeps the older figure", () => {
    expect(totalExperienceYears(5, 3)).toBe(8);
    expect(totalExperienceYears(null, 2)).toBe(2);
    expect(totalExperienceYears(40, 30)).toBe(60);
    expect(totalExperienceYears(null, null, 7)).toBe(7);
    expect(totalExperienceYears(undefined, undefined)).toBeNull();
  });

  it("masks passport numbers to the last 4", () => {
    expect(maskPassportLast4("4567")).toBe("XXXX4567");
    expect(maskPassportLast4("ab-12")).toBe("XXXXAB12");
    expect(maskPassportLast4(null)).toBe("");
  });

  it("offers a poster's trades first, mapped to our job categories where the names match", () => {
    const categories = [
      { value: "cat-welder", label: "Welder" },
      { value: "cat-fitter", label: "Pipe Fitter" },
    ];
    const options = posterTradeOptions(
      [
        { trade: "Welders", pay: "1200 AED" },
        { trade: "pipe fitter", pay: null },
        { trade: "Mechanical helper", pay: "900 AED + food" },
        { trade: "Welder", pay: null },
        { trade: "  ", pay: null },
      ],
      categories,
    );
    expect(options).toEqual([
      { value: "cat-welder", label: "Welders (1200 AED)" },
      { value: "cat-fitter", label: "pipe fitter" },
      { value: "other:Mechanical helper", label: "Mechanical helper (900 AED + food)" },
    ]);
  });
});

describe("list filters", () => {
  it("parses the requirement, source and has-CV filters and ignores junk", () => {
    const id = "0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e";
    expect(cvSubmissionFiltersSchema.parse({ requirement: id, source: "import", cv: "no", status: "new" })).toMatchObject({ requirement: id, source: "import", cv: "no", status: "received" });
    expect(cvSubmissionFiltersSchema.parse({ requirement: "x", source: "fax", cv: "maybe" })).toEqual({ requirement: undefined, source: undefined, cv: undefined, status: undefined, trade: undefined, country: undefined, q: undefined, expiring: undefined });
  });
});
