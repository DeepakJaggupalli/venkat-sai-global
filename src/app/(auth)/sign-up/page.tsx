import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { getPortalAccess, portalHomePath } from "@/modules/identity/authz";
import { isGoogleSignInEnabled } from "@/modules/identity/google";
import { sanitizeReturnTo } from "@/modules/identity/redirects";
import { getCurrentSession } from "@/modules/identity/session";
import { isSignupIntent } from "@/modules/identity/types";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

import { AuthHeading, AuthLinks } from "../_components/auth-heading";
import { SignUpForm } from "../_components/sign-up-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("signUp.metaTitle"), description: t("signUp.intent.candidate.description") };
}

export default async function SignUpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(sp(params, "returnTo"));
  const intentParam = sp(params, "intent");
  const intent = isSignupIntent(intentParam) ? intentParam : null;

  const current = await getCurrentSession();
  if (current?.needsTwoFactor) redirect("/sign-in/two-factor");
  if (current) redirect(returnTo ?? portalHomePath(await getPortalAccess(current.user)));

  const [t, googleEnabled, phoneAllowed, minPasswordLength] = await Promise.all([
    getT("auth"),
    isGoogleSignInEnabled(),
    isFeatureEnabled("auth.phone_otp"),
    getSetting("security.password_min_length"),
  ]);
  const copy = intent ?? "candidate";

  const carry = new URLSearchParams();
  if (returnTo) carry.set("returnTo", returnTo);
  if (intent) carry.set("intent", intent);
  const carried = carry.toString();

  return (
    <div className="space-y-6">
      <AuthHeading eyebrow={t(`signUp.intent.${copy}.eyebrow`)} title={t(`signUp.intent.${copy}.title`)} description={t(`signUp.intent.${copy}.description`)} />
      <SignUpForm intent={intent} returnTo={returnTo} phoneAllowed={phoneAllowed} minPasswordLength={minPasswordLength} googleEnabled={googleEnabled} />
      <AuthLinks>
        {t("signUp.haveAccount")}{" "}
        <Link href={`/sign-in${carried ? `?${carried}` : ""}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
          {t("signUp.signIn")}
        </Link>
      </AuthLinks>
    </div>
  );
}
