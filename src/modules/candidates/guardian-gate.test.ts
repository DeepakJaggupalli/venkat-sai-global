import { beforeEach, describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => ({ granted: false as boolean | null }));

// guard.ts also exports database helpers; this test only exercises the pure gate.
vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/modules/identity/consent", () => ({
  getConsentState: vi.fn(async () => (consent.granted === null ? {} : { guardian_consent: { granted: consent.granted } })),
}));

const { assertGuardianConsentIfMinor } = await import("./guard");
type Candidate = Parameters<typeof assertGuardianConsentIfMinor>[0];

function candidate(dateOfBirth: string | null): Candidate {
  return { userId: "00000000-0000-0000-0000-000000000001", dateOfBirth } as Candidate;
}

function yearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

describe("assertGuardianConsentIfMinor (DPDP children's data gate)", () => {
  beforeEach(() => {
    consent.granted = false;
  });

  it("allows adults and unknown birth dates", async () => {
    await expect(assertGuardianConsentIfMinor(candidate(yearsAgo(30)))).resolves.toBeUndefined();
    await expect(assertGuardianConsentIfMinor(candidate(null))).resolves.toBeUndefined();
  });

  it("refuses a minor without guardian consent", async () => {
    await expect(assertGuardianConsentIfMinor(candidate(yearsAgo(16)))).rejects.toMatchObject({ code: "guardian_consent_required" });
    consent.granted = null;
    await expect(assertGuardianConsentIfMinor(candidate(yearsAgo(16)))).rejects.toMatchObject({ code: "guardian_consent_required" });
  });

  it("allows a minor once guardian consent is granted", async () => {
    consent.granted = true;
    await expect(assertGuardianConsentIfMinor(candidate(yearsAgo(16)))).resolves.toBeUndefined();
  });
});
