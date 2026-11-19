import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { getPortalAccess, portalHomePath } from "@/modules/identity/authz";
import { isGoogleSignInEnabled } from "@/modules/identity/google";
import { INTENT_PORTAL_PATH, intentForPath, resolvePostAuthRedirect, sanitizeReturnTo } from "@/modules/identity/redirects";
import { getCurrentSession } from "@/modules/identity/session";
import { isSignupIntent, type SignupIntent } from "@/modules/identity/types";
import { isFeatureEnabled } from "@/modules/settings";

import { AccountTypeChoice, accountTypeItems } from "../_components/account-type-cards";
import { AuthHeading, AuthLinks } from "../_components/auth-heading";
import { GoogleButton, OrSeparator } from "../_components/google-button";
import { SignInForms } from "../_components/sign-in-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("signIn.metaTitle"), description: t("signIn.description") };
}

/** Errors that may be shown from the query string (set by our own redirects, e.g. the Google callback). */
const QUERY_ERRORS = new Set([
  "google_unavailable",
  "google_failed",
  "google_cancelled",
  "google_email_unverified",
  "google_email_conflict",
  "account_unavailable",
  "too_many_attempts",
  "session_expired",
]);

export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(sp(params, "returnTo"));
  const intentParam = sp(params, "intent");
  const intent = isSignupIntent(intentParam) ? intentParam : null;
  // The account type shown as chosen: the ?intent= deep link, else the portal the returnTo belongs to.
  const selectedType = intent ?? intentForPath(returnTo);

  const current = await getCurrentSession();
  if (current?.needsTwoFactor) redirect(`/sign-in/two-factor${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  if (current) {
    const access = await getPortalAccess(current.user);
    redirect(resolvePostAuthRedirect({ returnTo, intent, access, homePath: portalHomePath(access) }));
  }

  const [t, googleEnabled, emailOtp, phoneOtp] = await Promise.all([
    getT("auth"),
    isGoogleSignInEnabled(),
    isFeatureEnabled("auth.email_otp"),
    isFeatureEnabled("auth.phone_otp"),
  ]);

  const errorCode = sp(params, "error");
  const errorMessage = errorCode && QUERY_ERRORS.has(errorCode) ? t(`errors.${errorCode}`) : null;
  const notice = sp(params, "reset") === "1" ? t("signIn.notice.reset") : sp(params, "signedOut") === "1" ? t("signIn.notice.signedOut") : null;

  const carry = new URLSearchParams();
  if (returnTo) carry.set("returnTo", returnTo);
  if (intent) carry.set("intent", intent);
  const carried = carry.toString();
  const signUpHref = `/sign-up${carried ? `?${carried}` : ""}`;
  const googleParams = new URLSearchParams(carry);
  googleParams.set("consent", "notice");
  const googleHref = `/auth/google?${googleParams.toString()}`;

  /**
   * One sign-in form for every account type; choosing a type only sets where to go afterwards: that portal's home
   * (or the current returnTo when it is already inside that portal). The portal then applies its own access rules
   * (onboarding when the account has no organisation there; travel agency ↔ company redirect).
   */
  const hrefFor = (type: SignupIntent) => {
    const next = new URLSearchParams({ intent: type, returnTo: returnTo && intentForPath(returnTo) === type ? returnTo : INTENT_PORTAL_PATH[type] });
    return `/sign-in?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AuthHeading title={t("signIn.title")} description={t("signIn.description")} />
      <AccountTypeChoice label={t("accountType.label")} hint={t("accountType.signInHint")} items={accountTypeItems(t, hrefFor)} selected={selectedType} variant="tabs" />

      {notice ? (
        <Alert role="status" className="border-success/30 bg-success-soft">
          <CheckCircle2 className="text-success" aria-hidden />
          <AlertDescription className="text-foreground">{notice}</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive" className="border-destructive/30 bg-danger-soft">
          <AlertCircle aria-hidden />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <SignInForms returnTo={returnTo} intent={intent} otp={{ email: emailOtp, phone: phoneOtp }} />

      {googleEnabled ? (
        <div className="space-y-3">
          <OrSeparator label={t("common.or")} />
          <GoogleButton href={googleHref} label={t("google.continue")} describedById="google-notice" />
          <p id="google-notice" className="text-xs text-muted-foreground">
            {t("google.noticePrefix")}{" "}
            <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
              {t("consent.termsLink")}
            </Link>{" "}
            {t("google.noticeAnd")}{" "}
            <Link href="/legal/privacy-policy" className="underline underline-offset-2 hover:text-foreground">
              {t("consent.privacyLink")}
            </Link>
            {t("google.noticeSuffix")}
          </p>
        </div>
      ) : null}

      <AuthLinks>
        {t("signIn.noAccount")}{" "}
        <Link href={signUpHref} className="font-medium text-teal-strong underline-offset-4 hover:underline">
          {t("signIn.createAccount")}
        </Link>
      </AuthLinks>
    </div>
  );
}
