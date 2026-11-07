import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

import { evaluatePasswordStrength, hashPassword, verifyPassword, verifyPasswordAgainstDummy } from "./password";

describe("password policy", () => {
  const opts = { minLength: 10 };

  it("accepts a reasonable passphrase", () => {
    expect(evaluatePasswordStrength("orange-kite-river-42", opts)).toEqual({ ok: true });
  });

  it("enforces the configured minimum length", () => {
    expect(evaluatePasswordStrength("abc123xyz", opts)).toMatchObject({ ok: false, code: "short", minLength: 10 });
    expect(evaluatePasswordStrength("abc123xy", { minLength: 8 })).toEqual({ ok: true });
  });

  it("rejects passwords longer than 128 characters", () => {
    expect(evaluatePasswordStrength("ab1!".repeat(33), opts)).toMatchObject({ ok: false, code: "long" });
  });

  it("rejects common passwords regardless of case", () => {
    expect(evaluatePasswordStrength("Password123", opts)).toMatchObject({ ok: false, code: "common" });
    expect(evaluatePasswordStrength("QWERTYUIOP", opts)).toMatchObject({ ok: false, code: "common" });
  });

  it("requires some variety of characters", () => {
    expect(evaluatePasswordStrength("aaaabbbbaaaa", opts)).toMatchObject({ ok: false, code: "variety" });
  });

  it("rejects passwords that contain the email name or the person's name", () => {
    expect(evaluatePasswordStrength("venkatesh-2026!", { ...opts, email: "Venkatesh@example.com" })).toMatchObject({ ok: false, code: "email" });
    expect(evaluatePasswordStrength("my-lakshmi-pass", { ...opts, name: "Lakshmi Devi" })).toMatchObject({ ok: false, code: "name" });
    // Short name parts are ignored.
    expect(evaluatePasswordStrength("ram-is-not-checked-7", { ...opts, name: "Ram K" })).toEqual({ ok: true });
  });
});

describe("password hashing", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("orange-kite-river-42");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "orange-kite-river-42")).toBe(true);
    expect(await verifyPassword(hash, "orange-kite-river-43")).toBe(false);
  });

  it("normalises Unicode (NFKC) before hashing", async () => {
    const hash = await hashPassword("ｐａｓｓｗｏｒｄ-ｗｉｄｅ");
    expect(await verifyPassword(hash, "password-wide")).toBe(true);
  });

  it("never throws on a corrupt hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("burns comparable time when there is nothing to compare against", async () => {
    await expect(verifyPasswordAgainstDummy("whatever")).resolves.toBe(false);
  });
});
