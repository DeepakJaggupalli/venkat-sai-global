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

/** A tiny deny-list of the most common passwords (full breach checks can be added via HIBP k-anonymity). */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "123456789", "12345678", "1234567890", "qwerty123", "iloveyou",
  "admin123", "welcome1", "welcome123", "letmein", "abc12345", "india123", "passw0rd", "p@ssw0rd", "qwertyuiop",
]);

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export async function checkPasswordStrength(password: string, context: { email?: string | null; name?: string | null } = {}): Promise<PasswordCheck> {
  const minLength = await getSetting("security.password_min_length");
  if (password.length < minLength) return { ok: false, message: `Use at least ${minLength} characters.` };
  if (password.length > 128) return { ok: false, message: "Use at most 128 characters." };
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return { ok: false, message: "This password is too common. Choose something harder to guess." };
  if (new Set(password).size < 5) return { ok: false, message: "Use a mix of different characters." };
  const emailUser = context.email?.split("@")[0]?.toLowerCase();
  if (emailUser && emailUser.length >= 4 && lower.includes(emailUser)) return { ok: false, message: "Don't include your email address in the password." };
  return { ok: true };
}
