import { whatsappHref } from "@/config/contact";
import type { PublicLocale } from "@/i18n/config";
import { formatRelative } from "@/lib/format";

import { EN_MARKETING, intlLocale, type MarketingT } from "../marketing-i18n";
import type { PosterCard } from "./data";

/**
 * Pure helpers for the requirement cards (client-safe): the Apply link, the prefilled WhatsApp message to the office,
 * the "posted" time and which posters a list shows.
 */

/** The CV form with this requirement already picked. */
export function requirementApplyHref(slug: string): string {
  return `/send-cv?requirement=${encodeURIComponent(slug)}`;
}

/** "Welder (Saudi Arabia)"; the country is left out when the title already names it. */
export function requirementJobLabel(title: string, countryName?: string | null): string {
  const name = title.trim().replace(/\s+/g, " ");
  const country = countryName?.trim();
  if (!country || name.toLowerCase().includes(country.toLowerCase())) return name;
  return `${name} (${country})`;
}

export type RequirementMessageInput = { title: string; countryName?: string | null; /** Absolute link to the requirement page. */ url: string };

/** "Hello Venkat Sai, I want to apply for <title> (<country>). <link>", in the page language. */
export function requirementWhatsAppMessage({ title, countryName, url }: RequirementMessageInput, t: MarketingT = EN_MARKETING): string {
  return t("card.whatsappMessage", { job: requirementJobLabel(title, countryName), link: url.trim() });
}

/** wa.me link to the office WhatsApp (src/config/contact.ts unless another number is given) with that message. */
export function requirementWhatsAppHref(input: RequirementMessageInput, t: MarketingT = EN_MARKETING, e164?: string): string {
  return whatsappHref(requirementWhatsAppMessage(input, t), e164);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 days ago" in the page language (English keeps the wording used across the site). */
export function relativeTime(date: Date, locale: PublicLocale, now: number = Date.now()): string {
  if (locale === "en") return formatRelative(date);
  const seconds = Math.round((date.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
}

/**
 * The posters a list shows: newest first as loaded, every poster (with or without an image), without the one the
 * visitor is already reading, at most `limit`.
 */
export function pickPosters<T extends Pick<PosterCard, "slug">>(items: readonly T[], { limit, excludeSlug }: { limit: number; excludeSlug?: string | null }): T[] {
  const max = Math.max(0, Math.trunc(limit));
  return items.filter((p) => !excludeSlug || p.slug !== excludeSlug).slice(0, max);
}
