import { describe, expect, it, vi } from "vitest";

// env() validates DATABASE_URL even though these tests never connect; SESSION_SECRET falls back in tests.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

const { SHARED_UPLOAD_TTL_MINUTES, signSharedUploadToken, verifySharedUploadToken } = await import("./shared-upload-token");

const fileId = "3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b";
const now = new Date("2026-11-19T10:00:00Z");

describe("shared upload tokens", () => {
  it("round-trips the file id with a 2-hour expiry", () => {
    const { token, expiresAt } = signSharedUploadToken(fileId.toUpperCase(), now);
    expect(SHARED_UPLOAD_TTL_MINUTES).toBe(120);
    expect(expiresAt.toISOString()).toBe("2026-11-19T12:00:00.000Z");
    expect(verifySharedUploadToken(token, now)).toEqual({ fileId, expiresAt });
    expect(/^[A-Za-z0-9._-]+$/.test(token)).toBe(true);
  });

  it("expires after 2 hours", () => {
    const { token } = signSharedUploadToken(fileId, now);
    expect(verifySharedUploadToken(token, new Date(now.getTime() + 119 * 60_000))).not.toBeNull();
    expect(verifySharedUploadToken(token, new Date(now.getTime() + 120 * 60_000))).toBeNull();
  });

  it("rejects tampered, re-bound, malformed and over-long tokens", () => {
    const { token } = signSharedUploadToken(fileId, now);
    const [prefix, id, exp, sig] = token.split(".") as [string, string, string, string];
    const otherId = "11111111-2222-4333-8444-555555555555";
    expect(verifySharedUploadToken(`${prefix}.${otherId}.${exp}.${sig}`, now)).toBeNull();
    expect(verifySharedUploadToken(`${prefix}.${id}.${Number(exp) + 60}.${sig}`, now)).toBeNull();
    expect(verifySharedUploadToken(`${prefix}.${id}.${exp}.${sig.slice(0, -2)}xx`, now)).toBeNull();
    expect(verifySharedUploadToken(`v2.${id}.${exp}.${sig}`, now)).toBeNull();
    expect(verifySharedUploadToken("", now)).toBeNull();
    expect(verifySharedUploadToken(null, now)).toBeNull();
    expect(verifySharedUploadToken("v1.not-a-uuid.1.x", now)).toBeNull();
    // Correctly signed for a later time but valid for longer than the maximum lifetime: refused.
    const { token: future } = signSharedUploadToken(fileId, new Date(now.getTime() + 60 * 60_000));
    expect(verifySharedUploadToken(future, now)).toBeNull();
    expect(() => signSharedUploadToken("nope", now)).toThrow();
  });
});
