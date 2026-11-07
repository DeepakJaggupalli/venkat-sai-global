import type { Metadata } from "next";
import Link from "next/link";

import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/modules/settings";

import { AuthHeading, AuthLinks } from "../_components/auth-heading";
import { ForgotPasswordForm } from "../_components/password-reset-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("forgot.metaTitle") };
}

export default async function ForgotPasswordPage() {
  const [t, phoneAllowed] = await Promise.all([getT("auth"), isFeatureEnabled("auth.phone_otp")]);
  return (
    <div className="space-y-6">
      <AuthHeading title={t("forgot.title")} description={t(phoneAllowed ? "forgot.descriptionBoth" : "forgot.descriptionEmail")} />
      <ForgotPasswordForm phoneAllowed={phoneAllowed} />
      <AuthLinks>
        <Link href="/sign-in" className="font-medium text-teal-strong underline-offset-4 hover:underline">
          {t("forgot.backToSignIn")}
        </Link>
      </AuthLinks>
    </div>
  );
}
