import { describe, expect, it } from "vitest";

import { signTokenWith, verifyTokenWith } from "./signed-token";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const SUBJECT = "6f1c2b9e-1d1e-4c1a-9a55-2a8a0b2b7c11";

describe("signed tokens", () => {
  const now = new Date("2026-11-08T10:00:00Z");
  const inTwoHours = new Date(now.getTime() + 2 * 3600 * 1000);

  it("round-trips subject, expiry and version", () => {
    const token = signTokenWith(SECRET, "cv_docs", SUBJECT, inTwoHours, 3);
    const claims = verifyTokenWith(SECRET, token, "cv_docs", now);
    expect(claims).toEqual({ subject: SUBJECT, expiresAt: new Date(Math.floor(inTwoHours.getTime() / 1000) * 1000), version: 3 });
    expect(verifyTokenWith(SECRET, signTokenWith(SECRET, "cv_docs", SUBJECT, inTwoHours), "cv_docs", now)?.version).toBe(1);
  });

  it("rejects expired tokens", () => {
    const token = signTokenWith(SECRET, "cv_docs", SUBJECT, inTwoHours);
    expect(verifyTokenWith(SECRET, token, "cv_docs", new Date(inTwoHours.getTime() + 1000))).toBeNull();
    expect(verifyTokenWith(SECRET, token, "cv_docs", new Date(inTwoHours.getTime() - 1000))).not.toBeNull();
  });

  it("rejects another purpose, another secret and tampering", () => {
    const token = signTokenWith(SECRET, "cv_docs", SUBJECT, inTwoHours);
    expect(verifyTokenWith(SECRET, token, "resume_download", now)).toBeNull();
    expect(verifyTokenWith(`${SECRET}x`, token, "cv_docs", now)).toBeNull();
    const [body, sig] = token.split(".") as [string, string];
    const forgedBody = Buffer.from(JSON.stringify({ s: "someone-else", e: 9_999_999_999 })).toString("base64url");
    expect(verifyTokenWith(SECRET, `${forgedBody}.${sig}`, "cv_docs", now)).toBeNull();
    expect(verifyTokenWith(SECRET, `${body}.${sig.slice(0, -2)}xx`, "cv_docs", now)).toBeNull();
    expect(verifyTokenWith(SECRET, "garbage", "cv_docs", now)).toBeNull();
    expect(verifyTokenWith(SECRET, "", "cv_docs", now)).toBeNull();
    expect(verifyTokenWith(SECRET, null, "cv_docs", now)).toBeNull();
  });
});
