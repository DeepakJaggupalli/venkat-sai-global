/**
 * Internationalisation config (client-safe).
 * The People Portal and authentication screens are multilingual; business portals are English-first.
 * Add a language: add it to LOCALES + LOCALE_LABELS, create src/i18n/messages/<locale>/*.json,
 * and register the files in src/i18n/messages/index.ts. Missing keys fall back to English.
 */
export const LOCALES = ["en", "hi", "te"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "vsg_locale";

export const LOCALE_LABELS: Record<Locale, { label: string; english: string }> = {
  en: { label: "English", english: "English" },
  hi: { label: "हिन्दी", english: "Hindi" },
  te: { label: "తెలుగు", english: "Telugu" },
};

/**
 * Public-only languages: the translated public pages (homepage, /candidates, /safe-recruitment) also offer Odia and
 * Arabic. Only the PUBLIC_NAMESPACES catalogues exist for them (src/i18n/messages/<locale>/public-*.json); the People
 * Portal, auth, emails and the saved preference stay on LOCALES. Odia and Arabic copy: native-speaker review pending.
 */
export const PUBLIC_ONLY_LOCALES = ["or", "ar"] as const;
export type PublicOnlyLocale = (typeof PUBLIC_ONLY_LOCALES)[number];
export const PUBLIC_LOCALES = [...LOCALES, ...PUBLIC_ONLY_LOCALES] as const;
export type PublicLocale = (typeof PUBLIC_LOCALES)[number];
export const PUBLIC_NAMESPACES = ["public-marketing", "public-safety"] as const;
export type PublicNamespace = (typeof PUBLIC_NAMESPACES)[number];

export const PUBLIC_LOCALE_LABELS: Record<PublicLocale, { label: string; english: string }> = {
  ...LOCALE_LABELS,
  or: { label: "ଓଡ଼ିଆ", english: "Odia" },
  ar: { label: "العربية", english: "Arabic" },
};

export function isPublicLocale(value: string | null | undefined): value is PublicLocale {
  return !!value && (PUBLIC_LOCALES as readonly string[]).includes(value);
}

/**
 * Public language saved from the "Language & region" dialog when it is a public-only language (Odia, Arabic), which
 * LOCALE_COOKIE cannot hold. English, Hindi and Telugu are saved in LOCALE_COOKIE (and the user profile) instead.
 */
export const PUBLIC_LOCALE_COOKIE = "vsg_public_locale";
/** Visitor's region from the "Language & region" dialog (one of PUBLIC_REGIONS). */
export const REGION_COOKIE = "vsg_region";
/** Set once the first-visit "Language & region" prompt has been answered or dismissed. */
export const PREFS_SEEN_COOKIE = "vsg_prefs_seen";

export const PUBLIC_REGIONS = [
  { code: "IN", label: "India" },
  { code: "AE", label: "UAE" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "QA", label: "Qatar" },
  { code: "KW", label: "Kuwait" },
  { code: "OM", label: "Oman" },
  { code: "BH", label: "Bahrain" },
  { code: "SG", label: "Singapore" },
  { code: "MY", label: "Malaysia" },
  { code: "EU", label: "Europe" },
  { code: "OTHER", label: "Other" },
] as const;
export type PublicRegion = (typeof PUBLIC_REGIONS)[number]["code"];

export function isPublicRegion(value: string | null | undefined): value is PublicRegion {
  return !!value && PUBLIC_REGIONS.some((r) => r.code === value);
}

/** Writing direction of a page language (Arabic is right-to-left). */
export function localeDir(locale: PublicLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** One namespace per area so different owners never edit the same file. */
export const NAMESPACES = ["common", "auth", "talent-dashboard", "talent-profile", "talent-jobs", "talent-training", "talent-account", "talent-messages", "public-safety", "public-marketing"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export type Messages = Record<string, string>;

/** Interpolate "{name}" placeholders; pick "<key>_one"/"<key>_other" when vars.count is a number. */
export function translate(messages: Messages, fallback: Messages, key: string, vars?: Record<string, string | number>, locale: string = "en"): string {
  let lookupKey = key;
  if (vars && typeof vars.count === "number") {
    const rule = new Intl.PluralRules(locale).select(vars.count);
    const pluralKey = `${key}_${rule}`;
    if (messages[pluralKey] ?? fallback[pluralKey]) lookupKey = pluralKey;
    else if (messages[`${key}_other`] ?? fallback[`${key}_other`]) lookupKey = `${key}_other`;
  }
  const template = messages[lookupKey] ?? fallback[lookupKey] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (vars[name] !== undefined ? String(vars[name]) : `{${name}}`));
}
