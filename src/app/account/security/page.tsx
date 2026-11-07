import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { I18nProvider } from "@/i18n/client";
import { getClientMessages, getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { getSecurityOverview } from "@/modules/identity/queries";
import { sanitizeReturnTo } from "@/modules/identity/redirects";
import { getCurrentSession, requireUser } from "@/modules/identity/session";
import { getSetting } from "@/modules/settings";

import { ConnectedAccountsCard } from "./_components/connected-accounts-card";
import { PasswordCard } from "./_components/password-card";
import { SessionsCard, type SessionView } from "./_components/sessions-card";
import { TwoFactorCard } from "./_components/two-factor-card";
import { makeDateFormatters } from "./_lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("security.metaTitle"), robots: { index: false, follow: false } };
}

const GOOGLE_STATUS = new Set(["linked", "failed", "already_linked", "unavailable"]);

/**
 * /account/security — password, two-factor authentication, connected accounts and sessions.
 * Honours ?require=2fa&returnTo=… from requireStaff(): explains the staff requirement and returns
 * there once two-factor authentication is on.
 */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const requireTwoFactor = sp(params, "require") === "2fa";
  const returnTo = sanitizeReturnTo(sp(params, "returnTo"));
  if (requireTwoFactor && user.twoFactorEnabled) redirect(returnTo ?? "/account/security");

  const current = await getCurrentSession();
  if (!current) redirect("/sign-in?returnTo=%2Faccount%2Fsecurity");

  const [t, { locale, messages }, overview, minPasswordLength, staffTwoFactorRequired] = await Promise.all([
    getT("auth"),
    getClientMessages(["auth"]),
    getSecurityOverview(user.id, current.session.id),
    getSetting("security.password_min_length"),
    getSetting("security.require_staff_2fa"),
  ]);
  if (!overview) notFound();

  const fmt = makeDateFormatters(locale, overview.account.timezone);
  const sessions: SessionView[] = overview.sessions.map((session) => ({
    id: session.id,
    current: session.current,
    deviceType: session.deviceType,
    label:
      session.browser === "Unknown" && session.os === "Unknown"
        ? t("security.sessions.unknownDevice")
        : t("security.sessions.device", { browser: session.browser, os: session.os }),
    createdLabel: fmt.dateTime(session.createdAt) ?? "",
    lastSeenLabel: fmt.relative(session.lastSeenAt) ?? "",
  }));
  const googleAccount = overview.connectedAccounts.find((account) => account.provider === "google") ?? null;
  const googleStatus = sp(params, "google");
  const showStaffNotice = requireTwoFactor && !overview.twoFactor.enabled;

  const twoFactorSection = (
    <SectionCard
      id="two-factor"
      title={t("security.twoFactor.title")}
      description={t(overview.twoFactor.enabled ? "security.twoFactor.onDescription" : "security.twoFactor.description")}
    >
      <TwoFactorCard
        enabled={overview.twoFactor.enabled}
        enabledLabel={fmt.date(overview.twoFactor.enabledAt)}
        recoveryCodesRemaining={overview.twoFactor.recoveryCodesRemaining}
        hasPassword={overview.account.hasPassword}
        disableBlocked={user.isStaff && staffTwoFactorRequired}
        continueHref={requireTwoFactor ? (returnTo ?? "/admin") : null}
      />
    </SectionCard>
  );
  const passwordSection = (
    <SectionCard
      id="password"
      title={t(overview.account.hasPassword ? "security.password.title" : "security.password.titleSet")}
      description={
        overview.account.hasPassword
          ? overview.account.passwordChangedAt
            ? t("security.password.lastChanged", { date: fmt.date(overview.account.passwordChangedAt) ?? "" })
            : t("security.password.description")
          : t("security.password.noPassword")
      }
    >
      <PasswordCard hasPassword={overview.account.hasPassword} minPasswordLength={minPasswordLength} />
    </SectionCard>
  );

  return (
    <I18nProvider locale={locale} messages={messages}>
      {/* The account shell is English-first (lang="en"); this content follows the viewer's language. */}
      <div lang={locale} className="space-y-6">
        <PageHeader title={t("security.title")} description={t("security.description")} className="pb-0" />

        {showStaffNotice ? (
          <Alert className="border-info/30 bg-info-soft">
            <ShieldAlert className="text-info" aria-hidden />
            <AlertTitle>{t("security.staffNotice.title")}</AlertTitle>
            <AlertDescription className="text-foreground">{t("security.staffNotice.body")}</AlertDescription>
          </Alert>
        ) : null}
        {googleStatus && GOOGLE_STATUS.has(googleStatus) ? (
          googleStatus === "linked" ? (
            <Alert role="status" className="border-success/30 bg-success-soft">
              <CheckCircle2 className="text-success" aria-hidden />
              <AlertDescription className="text-foreground">{t("security.connected.status.linked")}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive" className="border-destructive/30 bg-danger-soft">
              <AlertCircle aria-hidden />
              <AlertDescription>{t(`security.connected.status.${googleStatus}`)}</AlertDescription>
            </Alert>
          )
        ) : null}

        {showStaffNotice ? (
          <>
            {twoFactorSection}
            {passwordSection}
          </>
        ) : (
          <>
            {passwordSection}
            {twoFactorSection}
          </>
        )}

        {overview.google.available || overview.google.linked ? (
          <SectionCard id="connected" title={t("security.connected.title")} description={t("security.connected.description")}>
            <ConnectedAccountsCard
              google={{
                available: overview.google.available,
                linked: overview.google.linked,
                email: googleAccount?.email ?? null,
                linkedLabel: fmt.date(googleAccount?.linkedAt),
                canDisconnect: overview.google.canDisconnect,
              }}
            />
          </SectionCard>
        ) : null}

        <SectionCard id="sessions" title={t("security.sessions.title")} description={t("security.sessions.description")}>
          <SessionsCard sessions={sessions} />
        </SectionCard>
      </div>
    </I18nProvider>
  );
}
