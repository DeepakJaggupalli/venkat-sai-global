import { getLocale } from "@/i18n/server";
import { getConsentServices, getConsentVersion } from "@/modules/analytics/config";
import type { ConsentSource } from "@/modules/analytics/consent";

import { ConsentPreferencesForm } from "./consent-preferences-form";

/**
 * Server wrapper for pages that show the cookie preferences form (/cookie-preferences, /account/privacy):
 *
 *   <ConsentPreferences />                          // on /cookie-preferences
 *   <ConsentPreferences source="account_privacy" /> // on /account/privacy
 */
export async function ConsentPreferences({ source = "cookie_preferences", className }: { source?: ConsentSource; className?: string }) {
  const [version, services, locale] = await Promise.all([getConsentVersion(), getConsentServices(), getLocale()]);
  return <ConsentPreferencesForm version={version} services={services} locale={locale} source={source} className={className} />;
}
