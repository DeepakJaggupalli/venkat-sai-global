import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { I18nProvider } from "@/i18n/client";
import { getClientMessages, getT } from "@/i18n/server";
import { getAccountOverview } from "@/modules/identity/queries";
import { requireUser } from "@/modules/identity/session";
import { isFeatureEnabled } from "@/modules/settings";

import { ContactCard } from "./security/_components/contact-card";
import { ProfileForm } from "./security/_components/profile-form";
import { makeDateFormatters, viewerTimeZone } from "./security/_lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("account.metaTitle"), robots: { index: false, follow: false } };
}

function timeZoneOptions(current: string | null): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

/** /account — name, language, time zone, email and mobile number (with verification). */
export default async function AccountPage() {
  const user = await requireUser();
  const [t, { locale, messages }, overview, phoneCodes] = await Promise.all([
    getT("auth"),
    getClientMessages(["auth"]),
    getAccountOverview(user.id),
    isFeatureEnabled("auth.phone_otp"),
  ]);
  if (!overview) notFound();
  const fmt = makeDateFormatters(locale, overview.timezone);

  return (
    <I18nProvider locale={locale} messages={messages}>
      {/* The account shell is English-first (lang="en"); this content follows the viewer's language. */}
      <div lang={locale} className="space-y-6">
        <PageHeader title={t("account.title")} description={t("account.description")} className="pb-0" />

        <SectionCard id="profile" title={t("account.profile.title")} description={t("account.profile.description")}>
          <ProfileForm
            displayName={overview.displayName}
            locale={overview.locale}
            timezone={overview.timezone}
            timezones={timeZoneOptions(overview.timezone)}
            defaultTimezone={viewerTimeZone(null)}
          />
        </SectionCard>

        <SectionCard id="contact" title={t("account.contact.title")} description={t("account.contact.description")}>
          <div className="space-y-3">
            <ContactCard
              kind="email"
              value={overview.email}
              verified={Boolean(overview.emailVerifiedAt)}
              hasPassword={overview.hasPassword}
              codesAvailable
            />
            <ContactCard
              kind="phone"
              value={overview.phone}
              verified={Boolean(overview.phoneVerifiedAt)}
              hasPassword={overview.hasPassword}
              codesAvailable={phoneCodes}
            />
          </div>
        </SectionCard>

        <p className="text-xs text-muted-foreground">{t("account.memberSince", { date: fmt.date(overview.createdAt) ?? "" })}</p>
      </div>
    </I18nProvider>
  );
}
