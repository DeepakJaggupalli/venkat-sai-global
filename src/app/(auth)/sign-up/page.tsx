import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { getPortalAccess, portalHomePath } from "@/modules/identity/authz";
import { isGoogleSignInEnabled } from "@/modules/identity/google";
import { intentForPath, resolvePostAuthRedirect, sanitizeReturnTo } from "@/modules/identity/redirects";
import { getCurrentSession } from "@/modules/identity/session";
import { isSignupIntent, type SignupIntent } from "@/modules/identity/types";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

import { AccountTypeChoice, accountTypeItems } from "../_components/account-type-cards";
import { AuthHeading, AuthLinks } from "../_components/auth-heading";
import { SignUpForm } from "../_components/sign-up-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("signUp.metaTitle"), description: t("signUp.intent.candidate.description") };
}

/**
 * Sign-up. Step 1 is the "I am a…" choice (Job seeker, Travel agency, Company / HR, Recruitment partner, Training
 * institute); step 2 is the form for that account type (?intent=…, also inferred from a portal returnTo such as
 * /talent). Deep links with ?intent= go straight to step 2. Signed-in visitors go to the chosen portal (or its onboarding).
 */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(sp(params, "returnTo"));
  const intentParam = sp(params, "intent");
  const explicitIntent = isSignupIntent(intentParam) ? intentParam : null;
  const intent = explicitIntent ?? intentForPath(returnTo);

  const current = await getCurrentSession();
  if (current?.needsTwoFactor) redirect("/sign-in/two-factor");
  if (current) {
    const access = await getPortalAccess(current.user);
    redirect(resolvePostAuthRedirect({ returnTo, intent: explicitIntent, access, homePath: portalHomePath(access) }));
  }

  const [t, googleEnabled, phoneAllowed, minPasswordLength] = await Promise.all([
    getT("auth"),
    isGoogleSignInEnabled(),
    isFeatureEnabled("auth.phone_otp"),
    getSetting("security.password_min_length"),
  ]);

  /** Keep a returnTo only for the account type it belongs to (a non-portal page counts as the job seeker's). */
  const hrefFor = (type: SignupIntent) => {
    const next = new URLSearchParams({ intent: type });
    const owner = intentForPath(returnTo);
    if (returnTo && (owner === type || (!owner && type === "candidate"))) next.set("returnTo", returnTo);
    return `/sign-up?${next.toString()}`;
  };
  const items = accountTypeItems(t, hrefFor);

  const carry = new URLSearchParams();
  if (returnTo) carry.set("returnTo", returnTo);
  if (intent) carry.set("intent", intent);
  const carried = carry.toString();
  const signInLink = (
    <AuthLinks>
      {t("signUp.haveAccount")}{" "}
      <Link href={`/sign-in${carried ? `?${carried}` : ""}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
        {t("signUp.signIn")}
      </Link>
    </AuthLinks>
  );

  if (!intent) {
    return (
      <div className="space-y-6">
        <AuthHeading title={t("signUp.choose.title")} description={t("signUp.choose.description")} />
        <AccountTypeChoice label={t("accountType.label")} items={items} selected={null} variant="cards" />
        {signInLink}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AuthHeading eyebrow={t(`signUp.intent.${intent}.eyebrow`)} title={t(`signUp.intent.${intent}.title`)} description={t(`signUp.intent.${intent}.description`)} />
      <AccountTypeChoice label={t("accountType.label")} items={items} selected={intent} variant="tabs" />
      <SignUpForm key={intent} intent={intent} returnTo={returnTo} phoneAllowed={phoneAllowed} minPasswordLength={minPasswordLength} googleEnabled={googleEnabled} />
      {signInLink}
    </div>
  );
}
