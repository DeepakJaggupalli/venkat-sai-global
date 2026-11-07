import { safeReturnTo } from "@/lib/http";

import type { PortalAccess } from "./authz";
import type { SignupIntent } from "./types";

/**
 * Where to send someone after they sign in or finish signing up (pure, unit-tested).
 *
 * Order: a safe same-site `returnTo` → staff go to the Command Centre → the sign-up intent
 * (onboarding for a portal the user does not have yet) → the user's portal home.
 */

/** Pages that must never be used as a post-auth destination (avoids loops). */
const AUTH_PATH_PREFIXES = ["/sign-in", "/sign-up", "/sign-out", "/verify", "/forgot-password", "/reset-password", "/auth/"];

export function isAuthPath(path: string): boolean {
  const pathname = path.split(/[?#]/)[0] ?? path;
  return AUTH_PATH_PREFIXES.some((prefix) => (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

/** A same-site relative path that is not an auth page, or null. */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value || value.length > 2000) return null;
  const safe = safeReturnTo(value, "");
  if (!safe || /[\r\n\t]/.test(safe) || isAuthPath(safe)) return null;
  return safe;
}

export const INTENT_ONBOARDING_PATH: Record<SignupIntent, string> = {
  candidate: "/talent/onboarding",
  employer: "/employer/onboarding",
  partner: "/recruiter/onboarding",
  institution: "/institution/onboarding",
};

const INTENT_PORTAL_PATH: Record<SignupIntent, string> = {
  candidate: "/talent",
  employer: "/employer",
  partner: "/recruiter",
  institution: "/institution",
};

function hasPortalFor(intent: SignupIntent, access: PortalAccess): boolean {
  switch (intent) {
    case "candidate":
      return access.talent;
    case "employer":
      return access.employer;
    case "partner":
      return access.recruiter;
    case "institution":
      return access.institution;
  }
}

export type PostAuthRedirectInput = {
  returnTo?: string | null;
  intent?: SignupIntent | null;
  access: PortalAccess;
  /** The account was created (or first activated) in this flow. */
  isNewUser?: boolean;
  /** Fallback, normally portalHomePath(access) from ./authz. */
  homePath: string;
};

export function resolvePostAuthRedirect(input: PostAuthRedirectInput): string {
  const returnTo = sanitizeReturnTo(input.returnTo);
  if (returnTo) return returnTo;
  if (input.access.admin) return "/admin";
  if (input.intent) {
    if (input.intent === "candidate") return input.isNewUser ? INTENT_ONBOARDING_PATH.candidate : INTENT_PORTAL_PATH.candidate;
    return hasPortalFor(input.intent, input.access) ? INTENT_PORTAL_PATH[input.intent] : INTENT_ONBOARDING_PATH[input.intent];
  }
  return safeReturnTo(input.homePath, "/talent");
}
