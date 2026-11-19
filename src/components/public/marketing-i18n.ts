import { DEFAULT_LOCALE, translate, type Locale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";

/**
 * Translator for the "public-marketing" namespace (homepage and /candidates).
 * Hindi and Telugu copy: native-speaker review pending.
 * Missing keys fall back to English. Components default to English, so they render unchanged in tests and on
 * pages that do not pick a language; the page resolves the visitor's language (see marketing-locale.ts).
 */
export type MarketingT = ((key: string, vars?: Record<string, string | number>) => string) & { locale: Locale };

export function marketingT(locale: Locale = DEFAULT_LOCALE): MarketingT {
  const messages = MESSAGES[locale]["public-marketing"];
  const fallback = MESSAGES[DEFAULT_LOCALE]["public-marketing"];
  return Object.assign((key: string, vars?: Record<string, string | number>) => translate(messages, fallback, key, vars, locale), { locale });
}

export const EN_MARKETING: MarketingT = marketingT();

/** The text before and after one "{name}" placeholder, so an element (e.g. a <time>) can sit inside the sentence. */
export function splitAround(template: string, name: string): [string, string] {
  const [before = "", after = ""] = template.split(`{${name}}`);
  return [before, after];
}

/** Region-formatted dates in the page language ("en-IN", "hi-IN", "te-IN"). */
export function intlLocale(locale: Locale): string {
  return `${locale}-IN`;
}
