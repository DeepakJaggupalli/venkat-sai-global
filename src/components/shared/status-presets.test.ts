import { describe, expect, it } from "vitest";

import { normalizeStatusKey, resolveStatus, STATUS_DOMAINS, STATUS_PRESETS } from "./status-presets";
import { isTone } from "./tones";
import { toVerificationState, VERIFICATION_COPY, VERIFICATION_STATES } from "./verification";

describe("resolveStatus", () => {
  it("uses the domain preset first", () => {
    expect(resolveStatus("pending_staff", "ticket")).toEqual({ tone: "warning", label: "Awaiting support", known: true });
    expect(resolveStatus("published", "job")).toMatchObject({ tone: "success", label: "Published" });
    expect(resolveStatus("overdue", "invoice")).toMatchObject({ tone: "danger" });
  });

  it("covers the required verification statuses", () => {
    for (const s of ["pending", "under_review", "verified", "rejected", "suspended", "expired"]) {
      expect(resolveStatus(s, "verification").known).toBe(true);
    }
  });

  it("falls back to the generic map, then to a neutral humanised label", () => {
    expect(resolveStatus("completed", "job")).toMatchObject({ tone: "success", label: "Completed", known: true });
    expect(resolveStatus("awaiting_documents", "job")).toEqual({ tone: "neutral", label: "Awaiting documents", known: false });
    expect(resolveStatus(null)).toEqual({ tone: "neutral", label: "Unknown", known: false });
  });

  it("normalises casing and separators", () => {
    expect(normalizeStatusKey(" Under-Review ")).toBe("under_review");
    expect(resolveStatus("UNDER REVIEW", "verification").label).toBe("Under review");
  });

  it("applies audience overrides", () => {
    expect(resolveStatus("rejected", "application", { rejected: { tone: "neutral", label: "Closed" } })).toMatchObject({ tone: "neutral", label: "Closed" });
  });

  it("only uses known tones", () => {
    for (const domain of STATUS_DOMAINS) {
      for (const def of Object.values(STATUS_PRESETS[domain])) expect(isTone(def.tone)).toBe(true);
    }
  });
});

describe("toVerificationState", () => {
  it("maps job info sources and verification statuses", () => {
    expect(toVerificationState("verified")).toBe("verified");
    expect(toVerificationState("employer_supplied")).toBe("employer_supplied");
    expect(toVerificationState("pending_review")).toBe("pending_review");
    expect(toVerificationState("under_review")).toBe("pending_review");
    expect(toVerificationState("self_declared")).toBe("self_declared");
  });

  it("never shows anything unconfirmed as verified", () => {
    for (const v of ["rejected", "expired", "unverified", "", null, undefined, "VERIFIED-ish"]) {
      expect(toVerificationState(v)).not.toBe("verified");
    }
  });

  it("has copy for every state, and only 'verified' claims a check", () => {
    for (const state of VERIFICATION_STATES) {
      expect(VERIFICATION_COPY[state].label).toBeTruthy();
      if (state !== "verified") expect(VERIFICATION_COPY[state].description.toLowerCase()).toMatch(/not|has not/);
    }
  });
});
