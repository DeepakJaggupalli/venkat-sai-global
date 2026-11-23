import "server-only";

import { DEFAULT_LOCALE, isPublicLocale, PUBLIC_LOCALES, translate, type PublicLocale } from "@/i18n/config";
import { publicMessages } from "@/i18n/messages";
import { getPublicLocale } from "@/i18n/server";

/**
 * Translator for the "public-safety" namespace (also in the public-only Odia and Arabic). `?lang=` lets a visitor
 * (or a shared link) pick a language for this page without changing their saved preference.
 */
export type SafetyT = (key: string, vars?: Record<string, string | number>) => string;

export async function getSafetyT(langParam?: string | string[]): Promise<{ t: SafetyT; locale: PublicLocale }> {
  const requested = Array.isArray(langParam) ? langParam[0] : langParam;
  const locale: PublicLocale = isPublicLocale(requested) ? requested : await getPublicLocale();
  const messages = publicMessages(locale, "public-safety");
  const fallback = publicMessages(DEFAULT_LOCALE, "public-safety");
  return { t: (key, vars) => translate(messages, fallback, key, vars, locale), locale };
}

export const SAFETY_LOCALES = PUBLIC_LOCALES;
