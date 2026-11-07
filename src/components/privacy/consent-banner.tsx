import { cookies } from "next/headers";

import { getLocale } from "@/i18n/server";
import { getConsentServices, getConsentVersion } from "@/modules/analytics/config";
import { CONSENT_COOKIE, consentNeedsPrompt, parseConsentCookie } from "@/modules/analytics/consent";

import { ConsentBannerClient } from "./consent-banner-client";

/**
 * Cookie / analytics consent banner (essential, functional, analytics, session insights), mounted once in
 * the root layout. Server wrapper: reads the consent version, the visitor's consent cookie (so the banner
 * is in the initial HTML when a choice is needed), the enabled third-party services and the UI language.
 */
export async function ConsentBanner() {
  const [version, services, locale, jar] = await Promise.all([getConsentVersion(), getConsentServices(), getLocale(), cookies()]);
  const initialNeedsPrompt = consentNeedsPrompt(parseConsentCookie(jar.get(CONSENT_COOKIE)?.value), version);
  return <ConsentBannerClient version={version} services={services} locale={locale} initialNeedsPrompt={initialNeedsPrompt} />;
}
