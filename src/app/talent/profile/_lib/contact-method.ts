/** Preferred contact method (client-safe constants; stored in users.preferences). */
export const CONTACT_METHODS = ["email", "phone", "whatsapp", "sms"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const CONTACT_METHOD_KEY = "talentContactMethod";

export function parseContactMethod(preferences: unknown): ContactMethod | null {
  if (!preferences || typeof preferences !== "object") return null;
  const value = (preferences as Record<string, unknown>)[CONTACT_METHOD_KEY];
  return typeof value === "string" && (CONTACT_METHODS as readonly string[]).includes(value) ? (value as ContactMethod) : null;
}
