import { describe, expect, it, vi } from "vitest";

// env() validates DATABASE_URL even though these tests never connect; SESSION_SECRET falls back in tests.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

const { signPreviewToken, verifyPreviewToken } = await import("./preview");

const entryId = "3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b";
const now = new Date("2026-11-07T10:00:00Z");

describe("preview tokens", () => {
  it("round-trips a pinned version and 'latest'", () => {
    const pinned = signPreviewToken({ entryId, version: 3, ttlMinutes: 30 }, now);
    expect(verifyPreviewToken(pinned.token, now)).toEqual({ entryId, version: 3, expiresAt: pinned.expiresAt });
    expect(pinned.expiresAt.toISOString()).toBe("2026-11-07T10:30:00.000Z");
    const latest = signPreviewToken({ entryId, version: "latest" }, now);
    expect(verifyPreviewToken(latest.token, now)?.version).toBe("latest");
  });

  it("expires", () => {
    const { token } = signPreviewToken({ entryId, version: 1, ttlMinutes: 10 }, now);
    expect(verifyPreviewToken(token, new Date(now.getTime() + 9 * 60_000))).not.toBeNull();
    expect(verifyPreviewToken(token, new Date(now.getTime() + 10 * 60_000))).toBeNull();
  });

  it("caps the lifetime at 24 hours", () => {
    const { expiresAt } = signPreviewToken({ entryId, version: 1, ttlMinutes: 10_000 }, now);
    expect(expiresAt.getTime() - now.getTime()).toBe(24 * 3600 * 1000);
  });

  it("rejects tampering with the entry, version or expiry", () => {
    const { token } = signPreviewToken({ entryId, version: 2 }, now);
    const [v, id, version, exp, sig] = token.split(".");
    const otherEntry = "aaaaaaaa-5a4d-4e6f-9a1b-2c3d4e5f6a7b";
    expect(verifyPreviewToken([v, otherEntry, version, exp, sig].join("."), now)).toBeNull();
    expect(verifyPreviewToken([v, id, "3", exp, sig].join("."), now)).toBeNull();
    expect(verifyPreviewToken([v, id, version, String(Number(exp) + 3600), sig].join("."), now)).toBeNull();
    expect(verifyPreviewToken([v, id, version, exp, `${sig}x`].join("."), now)).toBeNull();
  });

  it("refuses correctly shaped tokens that claim a lifetime beyond the maximum", () => {
    const farFuture = Math.floor(now.getTime() / 1000) + 48 * 3600;
    expect(verifyPreviewToken(`v1.${entryId}.1.${farFuture}.anything`, now)).toBeNull();
  });

  it("never throws on garbage", () => {
    for (const value of [null, undefined, "", "v1", "v1.x.y.z.w", "a".repeat(400), `v2.${entryId}.1.1.sig`]) {
      expect(verifyPreviewToken(value, now)).toBeNull();
    }
  });
});
