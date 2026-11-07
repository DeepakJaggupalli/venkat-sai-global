import "server-only";

import { hash, verify } from "@node-rs/argon2";

import { getSetting } from "@/modules/settings";

/**
 * Password hashing (argon2id, OWASP-recommended parameters) and strength policy.
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password.normalize("NFKC"), ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password.normalize("NFKC"));
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Spend the same time as a real verification when there is no account / no password to check,
 * so response timing does not reveal whether an account exists.
 */
export async function verifyPasswordAgainstDummy(password: string): Promise<false> {
  dummyHashPromise ??= hashPassword(`dummy-${Math.random().toString(36)}-${Date.now()}`);
  await verifyPassword(await dummyHashPromise, password);
  return false;
}

/** A tiny deny-list of the most common passwords (full breach checks can be added via HIBP k-anonymity). */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "123456789", "12345678", "1234567890", "qwerty123", "iloveyou",
  "admin123", "welcome1", "welcome123", "letmein", "abc12345", "india123", "passw0rd", "p@ssw0rd", "qwertyuiop",
]);

export const PASSWORD_HARD_MAX_LENGTH = 128;

/** Machine-readable reason, mapped to a translated message ("errors.weak_password_<code>") by the UI. */
export type PasswordIssue = "short" | "long" | "common" | "variety" | "email" | "name";

export type PasswordCheck = { ok: true } | { ok: false; message: string; code: PasswordIssue; minLength: number };

/** Pure policy check (no settings lookup) — `checkPasswordStrength` supplies the configured minimum. */
export function evaluatePasswordStrength(
  password: string,
  opts: { minLength: number; email?: string | null; name?: string | null },
): PasswordCheck {
  const { minLength } = opts;
  const fail = (code: PasswordIssue, message: string): PasswordCheck => ({ ok: false, code, message, minLength });
  if (password.length < minLength) return fail("short", `Use at least ${minLength} characters.`);
  if (password.length > PASSWORD_HARD_MAX_LENGTH) return fail("long", `Use at most ${PASSWORD_HARD_MAX_LENGTH} characters.`);
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return fail("common", "This password is too common. Choose something harder to guess.");
  if (new Set(password).size < 5) return fail("variety", "Use a mix of different characters.");
  const emailUser = opts.email?.split("@")[0]?.toLowerCase();
  if (emailUser && emailUser.length >= 4 && lower.includes(emailUser)) return fail("email", "Don't include your email address in the password.");
  const nameParts = (opts.name ?? "")
    .toLowerCase()
    .split(/[\s.,;:_'"@()-]+/)
    .filter((part) => part.length >= 4);
  if (nameParts.some((part) => lower.includes(part))) return fail("name", "Don't include your name in the password.");
  return { ok: true };
}

export async function checkPasswordStrength(password: string, context: { email?: string | null; name?: string | null } = {}): Promise<PasswordCheck> {
  const minLength = await getSetting("security.password_min_length");
  return evaluatePasswordStrength(password, { minLength, email: context.email, name: context.name });
}
