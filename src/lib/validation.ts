import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { z } from "zod";

/**
 * Reusable zod field builders for FormData-backed schemas (client-safe).
 * `formDataToObject` already turns blank inputs into `undefined`.
 */
export const f = {
  text: (opts: { min?: number; max?: number; label?: string } = {}) =>
    z
      .string({ error: `${opts.label ?? "This field"} is required` })
      .trim()
      .min(opts.min ?? 1, `${opts.label ?? "This field"} is required`)
      .max(opts.max ?? 500, `${opts.label ?? "This field"} is too long`),

  optionalText: (max = 500) => z.string().trim().max(max, "Too long").optional(),

  longText: (max = 10_000) => z.string().trim().max(max, "Too long").optional(),

  email: () =>
    z
      .string({ error: "Email is required" })
      .trim()
      .toLowerCase()
      .pipe(z.email("Enter a valid email address")),

  optionalEmail: () => z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).optional(),

  /** Phone normalised to E.164. `defaultCountry` applies to numbers typed without a + prefix. */
  phone: (defaultCountry: CountryCode = "IN") =>
    z
      .string({ error: "Phone number is required" })
      .trim()
      .transform((v, ctx) => {
        const parsed = parsePhoneNumberFromString(v, defaultCountry);
        if (!parsed || !parsed.isValid()) {
          ctx.addIssue({ code: "custom", message: "Enter a valid phone number with country code" });
          return z.NEVER;
        }
        return parsed.number as string;
      }),

  optionalPhone: (defaultCountry: CountryCode = "IN") =>
    z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return undefined;
        const parsed = parsePhoneNumberFromString(v, defaultCountry);
        if (!parsed || !parsed.isValid()) {
          ctx.addIssue({ code: "custom", message: "Enter a valid phone number with country code" });
          return z.NEVER;
        }
        return parsed.number as string;
      }),

  /** Checkbox / switch: "on" | "true" | "1" → true; absent → false. */
  bool: () => z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean()),

  int: (opts: { min?: number; max?: number } = {}) =>
    z.coerce
      .number({ error: "Enter a number" })
      .int("Enter a whole number")
      .min(opts.min ?? Number.MIN_SAFE_INTEGER)
      .max(opts.max ?? Number.MAX_SAFE_INTEGER),

  optionalInt: (opts: { min?: number; max?: number } = {}) =>
    z.preprocess(
      (v) => (v === undefined || v === null || v === "" ? undefined : v),
      z.coerce
        .number()
        .int("Enter a whole number")
        .min(opts.min ?? Number.MIN_SAFE_INTEGER)
        .max(opts.max ?? Number.MAX_SAFE_INTEGER)
        .optional(),
    ),

  /** Decimal amount typed by a user (e.g. "1250.50"); convert to minor units with toMinorUnits(). */
  amount: () => z.coerce.number({ error: "Enter an amount" }).nonnegative("Amount cannot be negative"),

  optionalAmount: () =>
    z.preprocess((v) => (v === undefined || v === "" ? undefined : v), z.coerce.number().nonnegative().optional()),

  uuid: () => z.uuid("Invalid identifier"),
  optionalUuid: () => z.uuid("Invalid identifier").optional(),

  /** Repeated inputs (`name[]`) → string[] (always an array). */
  stringArray: () => z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string().trim()).default([])),

  uuidArray: () => z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid()).default([])),

  /** <input type="date"> value (YYYY-MM-DD) → Date (UTC midnight). */
  date: () =>
    z
      .string({ error: "Date is required" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
      .transform((v) => new Date(`${v}T00:00:00.000Z`)),

  optionalDate: () =>
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
      .transform((v) => new Date(`${v}T00:00:00.000Z`))
      .optional(),

  /** <input type="datetime-local"> value; interpreted in the given IANA timezone offset by the caller. */
  dateTimeLocal: () => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter a valid date and time"),

  url: () => z.string().trim().pipe(z.url("Enter a valid URL (including https://)")),
  optionalUrl: () => z.string().trim().pipe(z.url("Enter a valid URL (including https://)")).optional(),

  enumOf: <const T extends readonly [string, ...string[]]>(values: T, message = "Choose a valid option") =>
    z.enum(values, { error: message }),

  countryCode: () => z.string().trim().length(2, "Choose a country").toUpperCase(),
  currencyCode: () => z.string().trim().length(3, "Choose a currency").toUpperCase(),
};

/** Normalise an email address for storage / lookup. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalise a phone number to E.164 or return null. */
export function normalizePhone(phone: string, defaultCountry: CountryCode = "IN"): string | null {
  const parsed = parsePhoneNumberFromString(phone.trim(), defaultCountry);
  return parsed && parsed.isValid() ? (parsed.number as string) : null;
}

/** "email or phone" login identifier → typed value. */
export function parseIdentifier(raw: string): { kind: "email"; value: string } | { kind: "phone"; value: string } | null {
  const v = raw.trim();
  if (v.includes("@")) {
    const r = z.email().safeParse(v.toLowerCase());
    return r.success ? { kind: "email", value: r.data } : null;
  }
  const phone = normalizePhone(v);
  return phone ? { kind: "phone", value: phone } : null;
}
