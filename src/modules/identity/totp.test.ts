import { Secret, TOTP } from "otpauth";
import { describe, expect, it, vi } from "vitest";

// The module graph imports @/db; a connection string is required at import time but never used here.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

import {
  buildTotpUri,
  consumeRecoveryCode,
  countRemainingRecoveryCodes,
  formatManualKey,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hashRecoveryCodes,
  normalizeRecoveryCode,
  totpQrCodeDataUrl,
  totpStepAt,
  verifyTotpCode,
} from "./totp";

function codeAt(secret: string, timestamp: number): string {
  return TOTP.generate({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30, timestamp });
}

describe("TOTP secrets and enrolment data", () => {
  it("generates 160-bit base32 secrets", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toEqual(secret);
  });

  it("builds an otpauth URI with issuer, label and parameters", () => {
    const secret = generateTotpSecret();
    const uri = buildTotpUri(secret, "asha@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=Venkat%20Sai%20Global");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
    expect(uri).toContain("asha%40example.com");
  });

  it("renders the QR code as a PNG data URL", async () => {
    const url = await totpQrCodeDataUrl(buildTotpUri(generateTotpSecret(), "user"));
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("groups the manual key in blocks of four", () => {
    expect(formatManualKey("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
  });
});

describe("verifyTotpCode", () => {
  const secret = generateTotpSecret();
  const now = Date.UTC(2026, 10, 7, 10, 0, 15);
  const step = totpStepAt(now);

  it("accepts the current code and returns its step", () => {
    expect(verifyTotpCode({ secret, code: codeAt(secret, now), lastUsedStep: null, now })).toEqual({ ok: true, step });
  });

  it("accepts the previous and next step (±1 window)", () => {
    expect(verifyTotpCode({ secret, code: codeAt(secret, now - 30_000), lastUsedStep: null, now })).toEqual({ ok: true, step: step - 1 });
    expect(verifyTotpCode({ secret, code: codeAt(secret, now + 30_000), lastUsedStep: null, now })).toEqual({ ok: true, step: step + 1 });
  });

  it("rejects codes outside the window", () => {
    expect(verifyTotpCode({ secret, code: codeAt(secret, now - 90_000), lastUsedStep: null, now }).ok).toBe(false);
    expect(verifyTotpCode({ secret, code: codeAt(secret, now + 90_000), lastUsedStep: null, now }).ok).toBe(false);
  });

  it("rejects a replayed code and any older step once a step was used", () => {
    const current = codeAt(secret, now);
    const first = verifyTotpCode({ secret, code: current, lastUsedStep: null, now });
    expect(first.ok).toBe(true);
    const lastUsedStep = first.ok ? first.step : 0;
    expect(verifyTotpCode({ secret, code: current, lastUsedStep, now: now + 5_000 })).toEqual({ ok: false, reason: "replayed" });
    expect(verifyTotpCode({ secret, code: codeAt(secret, now - 30_000), lastUsedStep, now })).toEqual({ ok: false, reason: "replayed" });
    // The next step is still fine.
    expect(verifyTotpCode({ secret, code: codeAt(secret, now + 30_000), lastUsedStep, now: now + 30_000 })).toEqual({ ok: true, step: step + 1 });
  });

  it("rejects malformed input and wrong codes", () => {
    expect(verifyTotpCode({ secret, code: "12345", lastUsedStep: null, now })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyTotpCode({ secret, code: "abcdef", lastUsedStep: null, now })).toEqual({ ok: false, reason: "malformed" });
    const valid = codeAt(secret, now);
    const wrong = String((Number(valid) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotpCode({ secret, code: wrong, lastUsedStep: null, now }).ok).toBe(false);
  });

  it("ignores spaces typed inside the code", () => {
    const code = codeAt(secret, now);
    expect(verifyTotpCode({ secret, code: `${code.slice(0, 3)} ${code.slice(3)}`, lastUsedStep: null, now }).ok).toBe(true);
  });
});

describe("recovery codes", () => {
  it("generates ten unique, readable codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
  });

  it("stores only keyed hashes and normalises user input", () => {
    const [code] = generateRecoveryCodes(1);
    const hash = hashRecoveryCode(code!);
    expect(hash).not.toContain(code!.replace("-", ""));
    expect(hashRecoveryCode(code!.toUpperCase())).toBe(hash);
    expect(hashRecoveryCode(` ${code!.replace("-", "")} `)).toBe(hash);
    expect(normalizeRecoveryCode("ABCDE-FGHJK")).toBe("abcdefghjk");
  });

  it("consumes each code once", () => {
    const codes = generateRecoveryCodes();
    let entries = hashRecoveryCodes(codes);
    expect(countRemainingRecoveryCodes(entries)).toBe(10);

    const first = consumeRecoveryCode(entries, codes[3]!, new Date("2026-11-07T10:00:00Z"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.remaining).toBe(9);
    expect(first.entries[3]!.usedAt).toBe("2026-11-07T10:00:00.000Z");
    entries = first.entries;

    expect(consumeRecoveryCode(entries, codes[3]!)).toEqual({ ok: false });
    expect(consumeRecoveryCode(entries, "aaaaa-aaaaa")).toEqual({ ok: false });
    expect(consumeRecoveryCode(entries, "short")).toEqual({ ok: false });

    const second = consumeRecoveryCode(entries, codes[0]!.toUpperCase());
    expect(second.ok && second.remaining).toBe(8);
  });
});
