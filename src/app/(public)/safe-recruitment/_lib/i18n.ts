import "server-only";

import { isLocale, LOCALES, translate, type Locale, type Messages } from "@/i18n/config";
import en from "@/i18n/messages/en/public-safety.json";
import hi from "@/i18n/messages/hi/public-safety.json";
import te from "@/i18n/messages/te/public-safety.json";
import { getLocale } from "@/i18n/server";

/**
 * Translator for the "public-safety" namespace. The catalogues are imported directly because the
 * namespace is not (yet) registered in src/i18n/messages/index.ts. `?lang=` lets a visitor (or a shared
 * link) pick a language for this page without changing their saved preference.
 */
const CATALOGUES: Record<Locale, Messages> = { en: en as Messages, hi: hi as Messages, te: te as Messages };

export type SafetyT = (key: string, vars?: Record<string, string | number>) => string;

export async function getSafetyT(langParam?: string | string[]): Promise<{ t: SafetyT; locale: Locale }> {
  const requested = Array.isArray(langParam) ? langParam[0] : langParam;
  const locale: Locale = isLocale(requested) ? requested : await getLocale();
  const messages = CATALOGUES[locale];
  return { t: (key, vars) => translate(messages, CATALOGUES.en, key, vars, locale), locale };
}

export const SAFETY_LOCALES = LOCALES;
