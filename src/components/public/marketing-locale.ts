import "server-only";

import { isPublicLocale, type PublicLocale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";

import { marketingT, type MarketingT } from "./marketing-i18n";

/**
 * Language for the homepage and /candidates: `?lang=` (a shared link or the hero switch, without changing the
 * saved preference; also the public-only Odia / Arabic) → the visitor's saved language (cookie, set from the
 * candidate's preference on sign-in) → English.
 */
export async function getMarketingT(langParam?: string | string[] | null): Promise<MarketingT> {
  const requested = Array.isArray(langParam) ? langParam[0] : langParam;
  const locale: PublicLocale = isPublicLocale(requested) ? requested : await getLocale();
  return marketingT(locale);
}
