import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, translate, type Locale, type Messages, type Namespace } from "./config";
import { MESSAGES } from "./messages";

/** Current locale: cookie (set by the language switcher / on sign-in from users.locale) → default. */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const value = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Server-side translator for a namespace:
 *   const t = await getT("talent-profile");
 *   t("title")  ·  t("skills.count", { count: 3 })
 * Missing keys fall back to English, then to the key itself.
 */
export async function getT(namespace: Namespace): Promise<TFunction> {
  const locale = await getLocale();
  const messages = MESSAGES[locale]?.[namespace] ?? {};
  const fallback = MESSAGES[DEFAULT_LOCALE][namespace] ?? {};
  return (key, vars) => translate(messages, fallback, key, vars, locale);
}

/** Messages to hand to <I18nProvider> for client components (merged with English fallback). */
export async function getClientMessages(namespaces: Namespace[]): Promise<{ locale: Locale; messages: Partial<Record<Namespace, Messages>> }> {
  const locale = await getLocale();
  const messages: Partial<Record<Namespace, Messages>> = {};
  for (const ns of namespaces) {
    messages[ns] = { ...(MESSAGES[DEFAULT_LOCALE][ns] ?? {}), ...(MESSAGES[locale]?.[ns] ?? {}) };
  }
  return { locale, messages };
}
