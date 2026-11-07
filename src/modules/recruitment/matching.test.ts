import { describe, expect, it } from "vitest";

import { normaliseIdentityNumber } from "@/modules/candidates/profile-rules";

import {
  attributionExpiresAt,
  decideAttribution,
  DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  findDuplicateMatches,
  isAttributionActive,
  matchIdentity,
  normalizeAttributionWindowDays,
  normalizeEmailAddress,
  normalizePassportNumber,
  normalizePersonName,
  passportLast4,
  type IdentityCandidate,
  type IdentityProbe,
} from "./matching";

const probe = (overrides: Partial<IdentityProbe> = {}): IdentityProbe => ({
  email: null,
  phone: null,
  passportHash: null,
  passportLast4: null,
  dateOfBirth: null,
  normalizedName: "",
  ...overrides,
});

const existing = (overrides: Partial<IdentityCandidate> = {}): IdentityCandidate => ({
  candidateId: "c1",
  email: null,
  phone: null,
  passportHash: null,
  passportLast4: null,
  dateOfBirth: null,
  names: ["Someone Else"],
  ...overrides,
});

describe("normalisation", () => {
  it("normalises names: case, accents, punctuation, honorifics, token order", () => {
    expect(normalizePersonName("  Mr. RAVI   Kumar ")).toBe("kumar ravi");
    expect(normalizePersonName("Kumar, Ravi")).toBe("kumar ravi");
    expect(normalizePersonName("José Álvarez")).toBe("alvarez jose");
    expect(normalizePersonName("Smt. Lakshmi Devi")).toBe("devi lakshmi");
    expect(normalizePersonName("")).toBe("");
    expect(normalizePersonName(null)).toBe("");
  });

  it("normalises emails and passport numbers", () => {
    expect(normalizeEmailAddress(" Ravi@Example.COM ")).toBe("ravi@example.com");
    expect(normalizeEmailAddress("  ")).toBeNull();
    expect(normalizePassportNumber(" k 123-4567 ")).toBe("K1234567");
    expect(normalizePassportNumber("12")).toBeNull();
    expect(normalizePassportNumber("K12#4567")).toBeNull();
    // Must hash like the candidates module, or duplicate detection by passport would silently fail.
    for (const raw of [" k12 34/56-7 ", "z1234567", "AB-12 34567"]) expect(normalizePassportNumber(raw)).toBe(normaliseIdentityNumber(raw));
    expect(passportLast4("K1234567")).toBe("4567");
    expect(passportLast4(null)).toBeNull();
  });
});

describe("duplicate matching", () => {
  it("matches on email or phone as the same account", () => {
    const byEmail = matchIdentity(probe({ email: "a@b.in" }), existing({ email: "A@B.in" }));
    expect(byEmail).toMatchObject({ matchedOn: ["email"], score: 100, isIdentityMatch: true });
    const byPhone = matchIdentity(probe({ phone: "+919876543210" }), existing({ phone: "+919876543210" }));
    expect(byPhone).toMatchObject({ matchedOn: ["phone"], isIdentityMatch: true });
  });

  it("matches on the passport hash", () => {
    expect(matchIdentity(probe({ passportHash: "h1" }), existing({ passportHash: "h1" }))).toMatchObject({ matchedOn: ["passport_number"], score: 95, isIdentityMatch: false });
  });

  it("matches passport last 4 only together with the date of birth", () => {
    expect(matchIdentity(probe({ passportLast4: "4567" }), existing({ passportLast4: "4567" }))).toBeNull();
    expect(matchIdentity(probe({ passportLast4: "4567", dateOfBirth: "1990-01-01" }), existing({ passportLast4: "4567", dateOfBirth: "1990-02-01" }))).toBeNull();
    expect(matchIdentity(probe({ passportLast4: "4567", dateOfBirth: "1990-01-01" }), existing({ passportLast4: "4567", dateOfBirth: "1990-01-01" }))).toMatchObject({
      matchedOn: ["passport_last4"],
      score: 80,
    });
  });

  it("matches normalised name + date of birth, against display or legal name", () => {
    const p = probe({ normalizedName: normalizePersonName("Ravi Kumar"), dateOfBirth: "1992-05-10" });
    expect(matchIdentity(p, existing({ names: ["Kumar Ravi"], dateOfBirth: "1992-05-10" }))).toMatchObject({ matchedOn: ["name_dob"], score: 70 });
    expect(matchIdentity(p, existing({ names: ["R. Kumar", "Ravi Kumar"], dateOfBirth: "1992-05-10" }))).toMatchObject({ matchedOn: ["name_dob"] });
    expect(matchIdentity(p, existing({ names: ["Ravi Kumar"], dateOfBirth: "1992-05-11" }))).toBeNull();
    expect(matchIdentity(p, existing({ names: ["Ravi Kumar"], dateOfBirth: null }))).toBeNull();
  });

  it("adds confidence for every extra matched field and ranks strongest first", () => {
    const p = probe({ passportLast4: "4567", dateOfBirth: "1990-01-01", normalizedName: "kumar ravi", passportHash: "h" });
    const matches = findDuplicateMatches(p, [
      existing({ candidateId: "weak", names: ["Ravi Kumar"], dateOfBirth: "1990-01-01" }),
      existing({ candidateId: "strong", names: ["Ravi Kumar"], dateOfBirth: "1990-01-01", passportLast4: "4567", passportHash: "h" }),
      existing({ candidateId: "none" }),
      existing({ candidateId: "strong", names: ["Ravi Kumar"], dateOfBirth: "1990-01-01" }),
    ]);
    expect(matches.map((m) => m.candidateId)).toEqual(["strong", "weak"]);
    expect(matches[0]!.matchedOn).toEqual(["passport_number", "passport_last4", "name_dob"]);
    expect(matches[0]!.score).toBe(100);
  });
});

describe("partner attribution window", () => {
  const now = new Date("2026-11-07T10:00:00Z");

  it("defaults to 90 days and clamps configured values", () => {
    expect(DEFAULT_ATTRIBUTION_WINDOW_DAYS).toBe(90);
    expect(normalizeAttributionWindowDays(undefined)).toBe(90);
    expect(normalizeAttributionWindowDays("abc")).toBe(90);
    expect(normalizeAttributionWindowDays(0)).toBe(1);
    expect(normalizeAttributionWindowDays(45.6)).toBe(46);
    expect(normalizeAttributionWindowDays("30")).toBe(30);
    expect(normalizeAttributionWindowDays(99_999)).toBe(3650);
  });

  it("computes the expiry from the first submission", () => {
    expect(attributionExpiresAt(now, 90).toISOString()).toBe("2027-02-05T10:00:00.000Z");
    expect(attributionExpiresAt(now, 1).toISOString()).toBe("2026-11-08T10:00:00.000Z");
  });

  it("treats only unexpired active attributions as live", () => {
    expect(isAttributionActive({ status: "active", expiresAt: new Date("2026-12-01T00:00:00Z") }, now)).toBe(true);
    expect(isAttributionActive({ status: "active", expiresAt: null }, now)).toBe(true);
    expect(isAttributionActive({ status: "active", expiresAt: new Date("2026-11-07T10:00:00Z") }, now)).toBe(false);
    expect(isAttributionActive({ status: "disputed", expiresAt: new Date("2026-12-01T00:00:00Z") }, now)).toBe(false);
    expect(isAttributionActive({ status: "expired", expiresAt: null }, now)).toBe(false);
  });

  it("first valid submission wins; others inside the window are duplicates", () => {
    const window = new Date("2027-01-01T00:00:00Z");
    expect(decideAttribution([], "p1", now)).toEqual({ kind: "attribute" });
    expect(decideAttribution([{ partnerOrganizationId: "p1", status: "active", expiresAt: window }], "p1", now)).toEqual({ kind: "already_attributed" });
    expect(decideAttribution([{ partnerOrganizationId: "p1", status: "active", expiresAt: window }], "p2", now)).toEqual({
      kind: "duplicate",
      attributedPartnerOrganizationId: "p1",
      expiresAt: window,
    });
  });

  it("lets a new partner win once the window has passed or the attribution was revoked", () => {
    const past = new Date("2026-10-01T00:00:00Z");
    expect(decideAttribution([{ partnerOrganizationId: "p1", status: "active", expiresAt: past }], "p2", now)).toEqual({ kind: "attribute" });
    expect(decideAttribution([{ partnerOrganizationId: "p1", status: "revoked", expiresAt: new Date("2027-01-01T00:00:00Z") }], "p2", now)).toEqual({ kind: "attribute" });
    expect(decideAttribution([{ partnerOrganizationId: "p1", status: "expired", expiresAt: past }], "p1", now)).toEqual({ kind: "attribute" });
  });
});
