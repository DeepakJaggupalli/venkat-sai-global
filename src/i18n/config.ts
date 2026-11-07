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

/** One namespace per area so different owners never edit the same file. */
export const NAMESPACES = ["common", "auth", "talent-dashboard", "talent-profile", "talent-jobs", "talent-training", "talent-account"] as const;
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
