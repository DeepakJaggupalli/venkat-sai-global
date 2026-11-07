import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

import { sealJson, unsealJson } from "./seal";
import { OTP_PURPOSES, SIGNUP_INTENTS, type AuthFlowKind, type OtpChannel, type OtpPurpose, type SignupIntent } from "./types";

/**
 * Pending multi-step auth flow (sign-up verification, one-time-code sign-in, SMS password reset),
 * carried between pages in a short-lived, encrypted, httpOnly cookie. The cookie only says which
 * code to check; the code itself is verified against the database.
 */
export const AUTH_FLOW_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vsg_auth_flow" : "vsg_auth_flow";
const AUTH_FLOW_PURPOSE = "auth-flow";
export const AUTH_FLOW_TTL_MS = 20 * 60_000;

export type AuthFlow = {
  v: 1;
  kind: AuthFlowKind;
  purpose: OtpPurpose;
  channel: OtpChannel;
  /** Normalised email or E.164 phone the code was sent to. */
  target: string;
  /** Null when no matching account exists (the flow still looks identical to the visitor). */
  userId: string | null;
  intent: SignupIntent | null;
  returnTo: string | null;
  /** Epoch ms when "Resend code" becomes available. */
  resendAvailableAt: number;
  /** Epoch ms after which the flow is void. */
  expiresAt: number;
};

const authFlowSchema: z.ZodType<AuthFlow> = z.object({
  v: z.literal(1),
  kind: z.enum(["signup", "login", "reset"]),
  purpose: z.enum(OTP_PURPOSES),
  channel: z.enum(["email", "sms"]),
  target: z.string().min(3).max(254),
  userId: z.uuid().nullable(),
  intent: z.enum(SIGNUP_INTENTS).nullable(),
  returnTo: z.string().max(2000).nullable(),
  resendAvailableAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export function sealAuthFlow(flow: AuthFlow): string {
  return sealJson(AUTH_FLOW_PURPOSE, flow);
}

export function unsealAuthFlow(value: string | null | undefined, now: number = Date.now()): AuthFlow | null {
  const flow = unsealJson(AUTH_FLOW_PURPOSE, value, authFlowSchema);
  return flow && flow.expiresAt > now ? flow : null;
}

/** True while the "Resend code" cooldown of the flow is still running. */
export function isResendCoolingDown(flow: Pick<AuthFlow, "resendAvailableAt">, now: number = Date.now()): boolean {
  return flow.resendAvailableAt > now;
}

export function newAuthFlow(input: Omit<AuthFlow, "v" | "expiresAt"> & { expiresAt?: number }): AuthFlow {
  return { ...input, v: 1, expiresAt: input.expiresAt ?? Date.now() + AUTH_FLOW_TTL_MS };
}

/** Store the flow (Server Actions / Route Handlers only). */
export async function setAuthFlow(flow: AuthFlow): Promise<void> {
  const jar = await cookies();
  jar.set(AUTH_FLOW_COOKIE, sealAuthFlow(flow), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(flow.expiresAt),
  });
}

export async function readAuthFlow(): Promise<AuthFlow | null> {
  const jar = await cookies();
  return unsealAuthFlow(jar.get(AUTH_FLOW_COOKIE)?.value);
}

export async function clearAuthFlow(): Promise<void> {
  const jar = await cookies();
  if (!jar.has(AUTH_FLOW_COOKIE)) return;
  // Repeat the attributes: browsers ignore a deletion of a "__Host-" cookie without Secure + Path=/.
  jar.delete({ name: AUTH_FLOW_COOKIE, path: "/", secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax" });
}
