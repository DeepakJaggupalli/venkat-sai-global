import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  createPkcePair,
  decodeJwtPayload,
  GOOGLE_OAUTH_TTL_MS,
  pkceChallenge,
  sealGoogleOAuthState,
  statesMatch,
  unsealGoogleOAuthState,
  validateGoogleIdTokenClaims,
} from "./google";
import { sealJson } from "./seal";

const CLIENT_ID = "1234567890-test.apps.googleusercontent.com";

function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(payload)}.signature`;
}

describe("PKCE", () => {
  it("matches the RFC 7636 S256 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("creates a 43-character verifier with its challenge", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(pkceChallenge(verifier));
  });
});

describe("state and nonce", () => {
  it("compares state in constant time and rejects missing or short values", () => {
    const state = "a".repeat(43);
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, `${"a".repeat(42)}b`)).toBe(false);
    expect(statesMatch(state, null)).toBe(false);
    expect(statesMatch(null, state)).toBe(false);
    expect(statesMatch("short", "short")).toBe(false);
  });

  const base = {
    intent: "employer" as const,
    returnTo: "/employer/jobs",
    consent: "checkbox" as const,
    marketing: { email: true, sms: false, whatsapp: false },
    mode: "signin" as const,
    linkUserId: null,
  };

  it("seals the OAuth state into an encrypted cookie and reads it back", () => {
    const now = Date.now();
    const { data, challenge } = createGoogleOAuthState(base, now);
    expect(data.state).not.toEqual(data.nonce);
    expect(challenge).toBe(pkceChallenge(data.verifier));
    const sealed = sealGoogleOAuthState(data);
    expect(sealed).not.toContain(data.state);
    expect(unsealGoogleOAuthState(sealed, now + 1000)).toEqual(data);
  });

  it("rejects an expired, tampered or foreign cookie", () => {
    const now = Date.now();
    const { data } = createGoogleOAuthState(base, now);
    const sealed = sealGoogleOAuthState(data);
    expect(unsealGoogleOAuthState(sealed, now + GOOGLE_OAUTH_TTL_MS + 1)).toBeNull();
    const parts = sealed.split(".");
    // Flip the first character of the GCM tag (always carries 6 full bits).
    parts[2] = `${parts[2]!.startsWith("A") ? "B" : "A"}${parts[2]!.slice(1)}`;
    expect(unsealGoogleOAuthState(parts.join("."), now)).toBeNull();
    expect(unsealGoogleOAuthState(sealJson("auth-flow", data), now)).toBeNull();
    expect(unsealGoogleOAuthState(undefined, now)).toBeNull();
  });
});

describe("authorization URL", () => {
  it("requests the code flow with PKCE S256, state and nonce", () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({ clientId: CLIENT_ID, redirectUri: "https://example.org/auth/google/callback", state: "s".repeat(43), nonce: "n".repeat(43), codeChallenge: "c".repeat(43) }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("s".repeat(43));
    expect(url.searchParams.get("nonce")).toBe("n".repeat(43));
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.org/auth/google/callback");
  });
});

describe("ID token claims", () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  const nowSeconds = Math.floor(now / 1000);
  const nonce = "nonce-value-1234567890";
  const valid = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "109876543210",
    email: "Asha.Rao@Example.com",
    email_verified: true,
    name: "Asha Rao",
    iat: nowSeconds - 10,
    exp: nowSeconds + 3600,
    nonce,
  };
  const check = (claims: Record<string, unknown>) => validateGoogleIdTokenClaims(claims, { clientId: CLIENT_ID, nonce, now });

  it("decodes the payload of a JWT", () => {
    expect(decodeJwtPayload(jwt(valid))).toEqual(valid);
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
  });

  it("accepts valid claims and normalises the email", () => {
    const result = check(valid);
    expect(result).toMatchObject({ ok: true, identity: { sub: "109876543210", email: "asha.rao@example.com", emailVerified: true, name: "Asha Rao" } });
    expect(check({ ...valid, iss: "accounts.google.com", email_verified: "true" }).ok).toBe(true);
  });

  it("rejects the wrong issuer or audience", () => {
    expect(check({ ...valid, iss: "https://evil.example" })).toEqual({ ok: false, reason: "issuer" });
    expect(check({ ...valid, aud: "someone-else" })).toEqual({ ok: false, reason: "audience" });
    expect(check({ ...valid, aud: [CLIENT_ID, "other"] })).toEqual({ ok: false, reason: "audience" });
    expect(check({ ...valid, aud: [CLIENT_ID, "other"], azp: CLIENT_ID }).ok).toBe(true);
  });

  it("rejects expired tokens and tokens issued in the future", () => {
    expect(check({ ...valid, exp: nowSeconds - 600 })).toEqual({ ok: false, reason: "expired" });
    expect(check({ ...valid, exp: undefined })).toEqual({ ok: false, reason: "expired" });
    expect(check({ ...valid, iat: nowSeconds + 3600 })).toEqual({ ok: false, reason: "issued_in_future" });
  });

  it("rejects a missing or different nonce", () => {
    expect(check({ ...valid, nonce: "other-nonce-0000000000" })).toEqual({ ok: false, reason: "nonce" });
    expect(check({ ...valid, nonce: undefined })).toEqual({ ok: false, reason: "nonce" });
  });

  it("requires a verified email and a subject", () => {
    expect(check({ ...valid, email_verified: false })).toEqual({ ok: false, reason: "email_unverified" });
    expect(check({ ...valid, email_verified: undefined })).toEqual({ ok: false, reason: "email_unverified" });
    expect(check({ ...valid, sub: "" })).toEqual({ ok: false, reason: "malformed" });
    expect(check({ ...valid, email: "not-an-email" })).toEqual({ ok: false, reason: "malformed" });
    expect(validateGoogleIdTokenClaims(null, { clientId: CLIENT_ID, nonce, now })).toEqual({ ok: false, reason: "malformed" });
  });
});
