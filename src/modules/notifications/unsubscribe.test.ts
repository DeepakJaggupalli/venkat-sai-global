import { describe, expect, it, vi } from "vitest";

// env() validates DATABASE_URL even though these tests never touch the database.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

import { createUnsubscribeToken, UNSUBSCRIBE_TOKEN_MAX_AGE_SECONDS, verifyUnsubscribeToken } from "./unsubscribe";

const USER = "4f6a1c9e-2b3d-4e5f-8a7b-9c0d1e2f3a4b";

describe("unsubscribe tokens", () => {
  it("round-trips user, category and channel", () => {
    const token = createUnsubscribeToken({ userId: USER, category: "job_alerts" });
    const result = verifyUnsubscribeToken(token);
    expect(result).toMatchObject({ ok: true, userId: USER, category: "job_alerts", channel: "email" });
  });

  it("detects any change to the payload or signature", () => {
    const token = createUnsubscribeToken({ userId: USER, category: "job_alerts" });
    const [payload, signature] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ v: 1, u: USER, c: "billing", ch: "email", t: Math.floor(Date.now() / 1000) })).toString("base64url");
    expect(verifyUnsubscribeToken(`${forged}.${signature}`)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyUnsubscribeToken(`${payload}.${signature.slice(0, -2)}xx`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects malformed input", () => {
    expect(verifyUnsubscribeToken("")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyUnsubscribeToken("abc")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyUnsubscribeToken("a.b.c")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyUnsubscribeToken(`${"x".repeat(700)}.y`)).toEqual({ ok: false, reason: "malformed" });
  });

  it("expires after a year", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = createUnsubscribeToken({ userId: USER, category: "support" }, issued);
    expect(verifyUnsubscribeToken(token, new Date(issued.getTime() + 30 * 86_400_000)).ok).toBe(true);
    expect(verifyUnsubscribeToken(token, new Date(issued.getTime() + (UNSUBSCRIBE_TOKEN_MAX_AGE_SECONDS + 60) * 1000))).toEqual({ ok: false, reason: "expired" });
  });

  it("produces URL-safe tokens", () => {
    expect(createUnsubscribeToken({ userId: USER, category: "announcements" })).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});
