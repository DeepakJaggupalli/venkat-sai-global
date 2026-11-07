import "server-only";

import { DEFAULT_MESSAGES_LABELS, type MessagesLabels } from "@/components/messages/labels";
import { DEFAULT_LOCALE, translate, type Locale, type Messages } from "@/i18n/config";
import en from "@/i18n/messages/en/talent-messages.json";
import hi from "@/i18n/messages/hi/talent-messages.json";
import te from "@/i18n/messages/te/talent-messages.json";
import { getLocale } from "@/i18n/server";

/**
 * Translator for the `talent-messages` catalogue. The namespace is not in the shared registry yet
 * (src/i18n/config.ts NAMESPACES is owned by the i18n owner), so it is loaded here directly with the
 * same fallback rules as getT(): current locale → English → key.
 */
const CATALOGUES: Record<Locale, Messages> = { en, hi, te };

export async function getMessagesT(): Promise<{ t: (key: string, vars?: Record<string, string | number>) => string; locale: Locale }> {
  const locale = await getLocale();
  const messages = CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
  return { t: (key, vars) => translate(messages, CATALOGUES[DEFAULT_LOCALE], key, vars, locale), locale };
}

export async function getTalentMessagesLabels(): Promise<{ labels: MessagesLabels; contextLabels: Record<string, string>; locale: Locale; t: (key: string) => string }> {
  const { t, locale } = await getMessagesT();
  const labels = Object.fromEntries(Object.keys(DEFAULT_MESSAGES_LABELS).map((k) => [k, t(k)])) as MessagesLabels;
  const contextLabels = Object.fromEntries(
    ["requirement", "partner_assignment", "partner_submission", "application", "placement", "organization"].map((c) => [c, t(`context.${c}`)]),
  );
  return { labels, contextLabels, locale, t };
}
