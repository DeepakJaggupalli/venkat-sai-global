import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { env, integrations } from "@/lib/env";
import { randomToken, safeEqual } from "@/lib/crypto";
import { isFeatureEnabled } from "@/modules/settings";

import { sealJson, unsealJson } from "./seal";
import { SIGNUP_INTENTS, type SignupIntent } from "./types";

/**
 * Google sign-in helpers: OAuth 2.0 authorization code flow with PKCE (S256), `state` and an
 * OpenID Connect `nonce`, kept in a short-lived encrypted httpOnly cookie. The ID token is read
 * from the token endpoint response (direct TLS channel, authenticated with the client secret,
 * per OIDC Core 3.1.3.7) after checking iss / aud / exp / iat / nonce and email_verified.
 */
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;
export const GOOGLE_START_PATH = "/auth/google";
export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
export const GOOGLE_OAUTH_COOKIE = process.env.NODE_ENV === "production" ? "__Secure-vsg_oauth_google" : "vsg_oauth_google";
export const GOOGLE_OAUTH_TTL_MS = 10 * 60_000;
const CLOCK_SKEW_SECONDS = 120;
const COOKIE_PURPOSE = "oauth-google";

export async function isGoogleSignInEnabled(): Promise<boolean> {
  return integrations.googleSignIn() && (await isFeatureEnabled("auth.google"));
}

// ---------------------------------------------------------------------------
// PKCE, state and nonce (pure)
// ---------------------------------------------------------------------------

/** base64url(SHA-256(verifier)) — RFC 7636 S256. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createPkcePair(): { verifier: string; challenge: string } {
  // 32 random bytes → 43 base64url characters (RFC 7636 allows 43–128).
  const verifier = randomToken(32);
  return { verifier, challenge: pkceChallenge(verifier) };
}

/** Constant-time comparison of the state we stored with the state Google sent back. */
export function statesMatch(expected: string | null | undefined, received: string | null | undefined): boolean {
  if (!expected || !received || expected.length < 16) return false;
  return safeEqual(expected, received);
}

export type GoogleConsentMode = "checkbox" | "notice";

export type GoogleOAuthState = {
  state: string;
  nonce: string;
  verifier: string;
  intent: SignupIntent | null;
  returnTo: string | null;
  /** How terms/privacy acceptance was captured before leaving for Google. */
  consent: GoogleConsentMode;
  marketing: { email: boolean; sms: boolean; whatsapp: boolean };
  mode: "signin" | "link";
  /** For mode "link": the signed-in user the Google account will be connected to. */
  linkUserId: string | null;
  createdAt: number;
};

const oauthStateSchema: z.ZodType<GoogleOAuthState> = z.object({
  state: z.string().min(16).max(200),
  nonce: z.string().min(16).max(200),
  verifier: z.string().min(43).max(128),
  intent: z.enum(SIGNUP_INTENTS).nullable(),
  returnTo: z.string().max(2000).nullable(),
  consent: z.enum(["checkbox", "notice"]),
  marketing: z.object({ email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean() }),
  mode: z.enum(["signin", "link"]),
  linkUserId: z.uuid().nullable(),
  createdAt: z.number().int().positive(),
});

export function createGoogleOAuthState(input: Omit<GoogleOAuthState, "state" | "nonce" | "verifier" | "createdAt">, now: number = Date.now()): {
  data: GoogleOAuthState;
  challenge: string;
} {
  const pkce = createPkcePair();
  return {
    data: { ...input, state: randomToken(32), nonce: randomToken(32), verifier: pkce.verifier, createdAt: now },
    challenge: pkce.challenge,
  };
}

export function sealGoogleOAuthState(data: GoogleOAuthState): string {
  return sealJson(COOKIE_PURPOSE, data);
}

/** Decrypt + validate the cookie; null when missing, tampered or older than 10 minutes. */
export function unsealGoogleOAuthState(value: string | null | undefined, now: number = Date.now()): GoogleOAuthState | null {
  const data = unsealJson(COOKIE_PURPOSE, value, oauthStateSchema);
  if (!data) return null;
  const age = now - data.createdAt;
  return age >= -60_000 && age <= GOOGLE_OAUTH_TTL_MS ? data : null;
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  loginHint?: string | null;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "online");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

// ---------------------------------------------------------------------------
// ID token claims (pure)
// ---------------------------------------------------------------------------

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  givenName: string | null;
  picture: string | null;
  locale: string | null;
};

export type ClaimsCheck =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: "malformed" | "issuer" | "audience" | "expired" | "issued_in_future" | "nonce" | "email_unverified" };

/** Validate the ID token claims we rely on. `now` is epoch milliseconds. */
export function validateGoogleIdTokenClaims(payload: unknown, expected: { clientId: string; nonce: string; now?: number }): ClaimsCheck {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "malformed" };
  const claims = payload as Record<string, unknown>;
  const nowSeconds = Math.floor((expected.now ?? Date.now()) / 1000);

  if (typeof claims.iss !== "string" || !(GOOGLE_ISSUERS as readonly string[]).includes(claims.iss)) return { ok: false, reason: "issuer" };

  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(expected.clientId)) return { ok: false, reason: "audience" };
  // With several audiences the authorised party must be us (OIDC Core 3.1.3.7 step 4-5).
  if (audiences.length > 1 && claims.azp !== expected.clientId) return { ok: false, reason: "audience" };

  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS <= nowSeconds) return { ok: false, reason: "expired" };
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) return { ok: false, reason: "issued_in_future" };

  if (typeof claims.nonce !== "string" || !expected.nonce || !safeEqual(claims.nonce, expected.nonce)) return { ok: false, reason: "nonce" };

  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 255) return { ok: false, reason: "malformed" };
  if (typeof claims.email !== "string" || !z.email().safeParse(claims.email.toLowerCase()).success) return { ok: false, reason: "malformed" };
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (!emailVerified) return { ok: false, reason: "email_unverified" };

  const text = (value: unknown, max = 200): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  return {
    ok: true,
    identity: {
      sub: claims.sub,
      email: claims.email.trim().toLowerCase(),
      emailVerified,
      name: text(claims.name, 100),
      givenName: text(claims.given_name, 100),
      picture: text(claims.picture, 1000),
      locale: text(claims.locale, 20),
    },
  };
}

// ---------------------------------------------------------------------------
// Token endpoint (network)
// ---------------------------------------------------------------------------

const tokenResponseSchema = z.object({
  id_token: z.string().min(20),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

export class GoogleExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleExchangeError";
  }
}

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const e = env();
  return e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } : null;
}

/** Exchange the authorization code (with the PKCE verifier) for tokens. Returns the raw ID token. */
export async function exchangeGoogleAuthorizationCode(input: { code: string; verifier: string; redirectUri: string }): Promise<{ idToken: string }> {
  const credentials = googleCredentials();
  if (!credentials) throw new GoogleExchangeError("Google sign-in is not configured");
  const body = new URLSearchParams({
    code: input.code,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.verifier,
  });
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new GoogleExchangeError(`Token request failed: ${error instanceof Error ? error.name : "unknown"}`);
  }
  if (!response.ok) throw new GoogleExchangeError(`Token endpoint returned ${response.status}`);
  const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new GoogleExchangeError("Unexpected token response");
  return { idToken: parsed.data.id_token };
}
