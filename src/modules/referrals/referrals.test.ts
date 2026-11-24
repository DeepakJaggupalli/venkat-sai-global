import { describe, expect, it } from "vitest";

import { CV_SUBMISSION_STATUSES } from "@/db/schema/cv-submissions";

import { generateReferralCode } from "./codes";
import {
  deriveRewardStatus,
  isGeneratedReferralCode,
  linkCvToReferrerSchema,
  markReferralPaidSchema,
  normaliseReferralCode,
  phoneSearchDigits,
  publicReferralStage,
  publicReferredName,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  referralCheckSchema,
  referralCookie,
  referralFiltersSchema,
  referralLinkPath,
  referralShareText,
  referralWhatsAppShareHref,
  referrerFirstName,
  referrerLinkSchema,
  referrerNamesMatch,
} from "./schemas";

const ID = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";

describe("referral codes", () => {
  it("uses an alphabet without look-alike characters", () => {
    expect(REFERRAL_CODE_ALPHABET).toHaveLength(32);
    for (const c of ["0", "O", "1", "I"]) expect(REFERRAL_CODE_ALPHABET).not.toContain(c);
    expect(new Set(REFERRAL_CODE_ALPHABET).size).toBe(REFERRAL_CODE_ALPHABET.length);
  });

  it("generates 6 characters of the alphabet, every character reachable", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
      expect(isGeneratedReferralCode(code)).toBe(true);
      for (const c of code) seen.add(c);
    }
    expect(seen.size).toBe(32);
    // The edges of the random range map to the first and last characters.
    expect(generateReferralCode(() => 0)).toBe("222222");
    expect(generateReferralCode((max) => max - 1)).toBe("ZZZZZZ");
  });

  it("rarely repeats (about a billion combinations)", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateReferralCode()));
    expect(codes.size).toBeGreaterThanOrEqual(1995);
  });

  it("normalises typed, lower-case, spaced and pasted codes", () => {
    expect(normaliseReferralCode("7kq2mx")).toBe("7KQ2MX");
    expect(normaliseReferralCode(" 7KQ 2MX ")).toBe("7KQ2MX");
    expect(normaliseReferralCode("7KQ-2MX")).toBe("7KQ2MX");
    expect(normaliseReferralCode("https://venkatsai.example/r/7kq2mx")).toBe("7KQ2MX");
    expect(normaliseReferralCode("https://venkatsai.example/r/7KQ2MX/?utm_source=wa")).toBe("7KQ2MX");
    expect(normaliseReferralCode("venkatsai.example/r/7KQ2MX#top")).toBe("7KQ2MX");
    for (const bad of ["", "   ", "abc", "TOO-LONG-CODE-1234567", "7KQ2M!", "../etc", null, undefined, 42, "a".repeat(400)]) {
      expect(normaliseReferralCode(bad)).toBeNull();
    }
    expect(isGeneratedReferralCode("7KQ2M0")).toBe(false);
    expect(referralLinkPath("7KQ2MX")).toBe("/r/7KQ2MX");
  });
});

describe("the /r/<CODE> cookie", () => {
  it("is httpOnly, Lax, site-wide, 30 days and Secure only in production", () => {
    const prod = referralCookie("7kq2mx", { production: true });
    expect(prod).toEqual({
      name: REFERRAL_COOKIE,
      value: "7KQ2MX",
      options: { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 30 * 24 * 60 * 60 },
    });
    expect(REFERRAL_COOKIE).toBe("vsg_ref");
    expect(REFERRAL_COOKIE_MAX_AGE_SECONDS).toBe(2_592_000);
    expect(referralCookie("7KQ2MX", { production: false })?.options.secure).toBe(false);
  });

  it("is never built from a value that cannot be a code", () => {
    for (const bad of ["", "x", "<script>", "7KQ2MX;path=/admin", "a b c d e f g h i j k l m n o p q"]) expect(referralCookie(bad, { production: true })).toBeNull();
  });
});

describe("derived reward status", () => {
  it("is due when departed, paid once a payout exists, not eligible when not suitable, otherwise in progress", () => {
    for (const status of CV_SUBMISSION_STATUSES) {
      const expected = status === "departed" ? "due" : status === "not_suitable" ? "not_eligible" : "in_progress";
      expect(deriveRewardStatus(status, false)).toBe(expected);
      expect(deriveRewardStatus(status, true)).toBe("paid");
    }
  });

  it("shows the referrer a coarse stage only", () => {
    expect(publicReferralStage("received")).toBe("received");
    for (const s of ["contacted", "trade_test", "selected", "medical", "visa", "ticket", "on_hold"] as const) expect(publicReferralStage(s)).toBe("in_progress");
    expect(publicReferralStage("departed")).toBe("placed");
    expect(publicReferralStage("not_suitable")).toBe("closed");
  });
});

describe("what a referrer sees of a referred person", () => {
  it("shows the first name and the initial of the last name", () => {
    expect(publicReferredName("Ravi Kumar Reddy")).toBe("Ravi R.");
    expect(publicReferredName("RAVI KUMAR")).toBe("Ravi K.");
    expect(publicReferredName("ravi")).toBe("Ravi");
    expect(publicReferredName("K. Ravi Kumar")).toBe("Ravi K.");
    expect(publicReferredName("K Ravi")).toBe("Ravi K.");
    expect(publicReferredName("  Suresh   babu ")).toBe("Suresh B.");
    expect(publicReferredName("McDonald O'Neil")).toBe("McDonald O.");
    expect(publicReferredName("రవి కుమార్")).toBe("రవి క.");
    expect(publicReferredName("...")).toBe("Your friend");
  });

  it("greets the referrer by first name", () => {
    expect(referrerFirstName("K. Ravi Kumar")).toBe("Ravi");
    expect(referrerFirstName("PRASAD")).toBe("Prasad");
    expect(referrerFirstName("")).toBe("");
  });
});

describe("returning referrer name check", () => {
  it("accepts the same person typing their name differently", () => {
    expect(referrerNamesMatch("Ravi Kumar", "ravi kumar")).toBe(true);
    expect(referrerNamesMatch("Ravi Kumar", "Kumar Ravi")).toBe(true);
    expect(referrerNamesMatch("K. Ravi Kumar", "Ravi Kumar")).toBe(true);
    expect(referrerNamesMatch("Kandregula Ravi Kumar", "ravi kumar")).toBe(true);
    expect(referrerNamesMatch("Ravi Kumar", "Ravi Kumar Reddy")).toBe(true);
    expect(referrerNamesMatch("Ravikumar", "Ravi Kumar")).toBe(true);
    expect(referrerNamesMatch("Sai Travels", "sai travels agency")).toBe(true);
    expect(referrerNamesMatch("José Pérez", "jose perez")).toBe(true);
    expect(referrerNamesMatch("Ravi", "ravi")).toBe(true);
  });

  it("refuses a different name", () => {
    expect(referrerNamesMatch("Ravi Kumar", "Suresh")).toBe(false);
    expect(referrerNamesMatch("Ravi Kumar", "R")).toBe(false);
    expect(referrerNamesMatch("Ravi Kumar", "   ")).toBe(false);
    expect(referrerNamesMatch("Ab", "Abhishek")).toBe(false);
  });

  it("refuses guesses by a stranger who only knows the mobile number", () => {
    // One common word, part of the name, or a list of names is not enough.
    expect(referrerNamesMatch("Ravi Kumar", "Kumar")).toBe(false);
    expect(referrerNamesMatch("Ravi Kumar", "Ravi")).toBe(false);
    expect(referrerNamesMatch("Ravi Kumar Reddy", "Reddy")).toBe(false);
    expect(referrerNamesMatch("Ravikumar", "kumar")).toBe(false);
    expect(referrerNamesMatch("Ravi Kumar", "Suresh Kumar")).toBe(false);
    expect(referrerNamesMatch("Ravi Kumar", "Ravi Kumar Reddy Rao Naidu Suresh")).toBe(false);
    expect(referrerNamesMatch("Ravi", "Ravi Suresh")).toBe(false);
  });
});

describe("share text", () => {
  it("ends with the link and says applying is free", () => {
    const url = "https://venkatsai.example/r/7KQ2MX";
    const text = referralShareText(url);
    expect(text.endsWith(url)).toBe(true);
    expect(text).toMatch(/Applying is free/);
    expect(referralWhatsAppShareHref(url)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  });
});

describe("public forms", () => {
  it("needs name, a valid mobile number and consent to get a link", () => {
    const parsed = referrerLinkSchema.parse({ name: " Ravi Kumar ", phone: "98765 43210", consentToContact: "true" });
    expect(parsed).toMatchObject({ name: "Ravi Kumar", phone: "+919876543210", consentToContact: true });
    const missing = referrerLinkSchema.safeParse({ name: "", phone: "123" });
    expect(missing.success).toBe(false);
    const paths = missing.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "phone", "consentToContact"]));
  });

  it("checks referrals with a mobile number and a code or a pasted link", () => {
    expect(referralCheckSchema.parse({ phone: "+971 50 123 4567", code: "https://x.example/r/7kq2mx" })).toEqual({ phone: "+971501234567", code: "7KQ2MX" });
    const bad = referralCheckSchema.safeParse({ phone: "9876543210", code: "!!" });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0]!.path).toEqual(["code"]);
  });
});

describe("staff forms", () => {
  it("needs an amount and a currency (no default), with the currency's decimals", () => {
    expect(markReferralPaidSchema.safeParse({ cvSubmissionId: ID, amount: "1000" }).success).toBe(false);
    expect(markReferralPaidSchema.parse({ cvSubmissionId: ID, amount: "1000", currency: "INR" })).toMatchObject({ amount: 1000, currency: "INR" });
    expect(markReferralPaidSchema.parse({ cvSubmissionId: ID, amount: "12.345", currency: "KWD" }).amount).toBe(12.345);
    const tooPrecise = markReferralPaidSchema.safeParse({ cvSubmissionId: ID, amount: "10.005", currency: "INR" });
    expect(tooPrecise.success).toBe(false);
    expect(tooPrecise.error!.issues[0]!.path).toEqual(["amount"]);
    for (const amount of ["0", "-5", "abc", undefined]) expect(markReferralPaidSchema.safeParse({ cvSubmissionId: ID, amount, currency: "AED" }).success).toBe(false);
    expect(markReferralPaidSchema.safeParse({ cvSubmissionId: ID, amount: "100", currency: "JPY" }).success).toBe(false);
  });

  it("links a CV by reference to a referrer code", () => {
    expect(linkCvToReferrerSchema.parse({ cvReference: " vsg-cv-000123 ", referralCode: "7kq2mx" })).toEqual({ cvReference: "VSG-CV-000123", referralCode: "7KQ2MX" });
    expect(linkCvToReferrerSchema.safeParse({ cvReference: "CV-123", referralCode: "7KQ2MX" }).success).toBe(false);
  });

  it("finds a referrer by a mobile number typed the way WhatsApp shows it", () => {
    expect(phoneSearchDigits("+91 98765 43210")).toEqual(["919876543210"]);
    expect(phoneSearchDigits("98765 43210")).toEqual(["9876543210"]);
    expect(phoneSearchDigits("098765-43210")).toEqual(["09876543210", "9876543210"]);
    expect(phoneSearchDigits("(050) 123 4567")).toEqual(["0501234567", "501234567"]);
    expect(phoneSearchDigits("0001")).toEqual(["0001"]);
    for (const short of ["", "Ravi", "7KQ", "12 3"]) expect(phoneSearchDigits(short)).toEqual([]);
  });

  it("ignores invalid list filters", () => {
    expect(referralFiltersSchema.parse({})).toEqual({ view: "referred" });
    expect(referralFiltersSchema.parse({ view: "referrers", reward: "due", status: "blocked", referrer: ID, q: " ravi " })).toEqual({ view: "referrers", reward: "due", status: "blocked", referrer: ID, q: "ravi" });
    expect(referralFiltersSchema.parse({ view: "x", reward: "maybe", status: "gone", referrer: "1" })).toEqual({ view: "referred" });
  });
});
