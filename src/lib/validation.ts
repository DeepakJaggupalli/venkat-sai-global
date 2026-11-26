import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { z } from "zod";

/** Largest money amount a form accepts (major units): one trillion, still a safe integer in minor units. */
export const MAX_AMOUNT = 1_000_000_000_000;

/**
 * Reusable zod field builders for FormData-backed schemas (client-safe).
 * `formDataToObject` already turns blank inputs into `undefined`.
 */
export const f = {
  text: (opts: { min?: number; max?: number; label?: string } = {}) =>
    z
      .string({ error: `${opts.label ?? "This field"} is required` })
      .trim()
      .min(opts.min ?? 1, (opts.min ?? 1) > 1 ? `${opts.label ?? "This field"} needs at least ${opts.min} characters` : `${opts.label ?? "This field"} is required`)
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
      .min(opts.min ?? Number.MIN_SAFE_INTEGER, `Enter ${opts.min ?? Number.MIN_SAFE_INTEGER} or more`)
      .max(opts.max ?? Number.MAX_SAFE_INTEGER, `Enter ${opts.max ?? Number.MAX_SAFE_INTEGER} or less`),

  optionalInt: (opts: { min?: number; max?: number } = {}) =>
    z.preprocess(
      (v) => (v === undefined || v === null || v === "" ? undefined : v),
      z.coerce
        .number({ error: "Enter a number" })
        .int("Enter a whole number")
        .min(opts.min ?? Number.MIN_SAFE_INTEGER, `Enter ${opts.min ?? Number.MIN_SAFE_INTEGER} or more`)
        .max(opts.max ?? Number.MAX_SAFE_INTEGER, `Enter ${opts.max ?? Number.MAX_SAFE_INTEGER} or less`)
        .optional(),
    ),

  /**
   * Decimal amount typed by a user (e.g. "1250.50"); convert to minor units with toMinorUnits(). Capped at
   * MAX_AMOUNT so the minor-unit value stays a safe integer for the bigint money columns.
   */
  amount: () => z.coerce.number({ error: "Enter an amount" }).nonnegative("Amount cannot be negative").max(MAX_AMOUNT, "Amount is too large"),

  optionalAmount: () =>
    z.preprocess(
      (v) => (v === undefined || v === "" ? undefined : v),
      z.coerce.number({ error: "Enter an amount" }).nonnegative("Amount cannot be negative").max(MAX_AMOUNT, "Amount is too large").optional(),
    ),

  uuid: () => z.uuid("Invalid identifier"),
  optionalUuid: () => z.uuid("Invalid identifier").optional(),

  /** Repeated inputs (`name[]`) → string[] (always an array). */
  stringArray: () => z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string().trim()).default([])),

  uuidArray: () => z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid()).default([])),

  /** <input type="date"> value (YYYY-MM-DD) → Date (UTC midnight). Impossible days (2026-13-01, 2026-02-31) are rejected. */
  date: () =>
    z
      .string({ error: "Date is required" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
      .refine(isCalendarDay, "Enter a valid date")
      .transform((v) => new Date(`${v}T00:00:00.000Z`)),

  optionalDate: () =>
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
      .refine(isCalendarDay, "Enter a valid date")
      .transform((v) => new Date(`${v}T00:00:00.000Z`))
      .optional(),

  /** <input type="datetime-local"> value; interpreted in the given IANA timezone offset by the caller. */
  dateTimeLocal: () => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter a valid date and time"),

  url: () => z.string().trim().pipe(z.url("Enter a valid URL (including https://)")),
  optionalUrl: () => z.string().trim().pipe(z.url("Enter a valid URL (including https://)")).optional(),

  enumOf: <const T extends readonly [string, ...string[]]>(values: T, message = "Choose a valid option") =>
    z.enum(values, { error: message }),

  // `error` also covers a select left empty (the field is then missing from FormData, not "").
  countryCode: () => z.string({ error: "Choose a country" }).trim().length(2, "Choose a country").toUpperCase(),
  currencyCode: () => z.string({ error: "Choose a currency" }).trim().length(3, "Choose a currency").toUpperCase(),
};

/**
 * True for a real calendar day in YYYY-MM-DD form. A hand-made request can send "2026-13-01" (an Invalid Date that
 * makes later `toISOString()` calls throw) or "2026-02-31" (which JavaScript silently rolls over to 3 March).
 */
export function isCalendarDay(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

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
