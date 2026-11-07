import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { maskPhone } from "@/lib/format";
import { sp, type SearchParams } from "@/lib/http";
import { isResendCoolingDown, readAuthFlow } from "@/modules/identity/flow";
import { inspectPasswordResetToken } from "@/modules/identity/service";
import { getSetting } from "@/modules/settings";

import { AuthHeading, AuthLinks } from "../_components/auth-heading";
import { ResetWithCodeForm, ResetWithTokenForm } from "../_components/password-reset-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  // The URL carries a secret token: never send it as a referrer.
  return { title: t("reset.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

function RequestNewLink({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="space-y-6">
      <AuthHeading title={title} description={body} />
      <Button asChild size="lg" className="h-10 w-full sm:w-auto">
        <Link href="/forgot-password">{cta}</Link>
      </Button>
    </div>
  );
}

/** /reset-password?token=… (e-mailed link) or the SMS-code flow started on /forgot-password. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = sp(params, "token");
  const [t, minPasswordLength] = await Promise.all([getT("auth"), getSetting("security.password_min_length")]);

  if (token) {
    const status = await inspectPasswordResetToken(token);
    if (!status.valid) {
      return (
        <RequestNewLink
          title={t("reset.invalidTitle")}
          body={t(status.reason === "expired" ? "reset.expiredBody" : status.reason === "used" ? "reset.usedBody" : "reset.invalidBody")}
          cta={t("reset.requestNew")}
        />
      );
    }
    return (
      <div className="space-y-6">
        <AuthHeading title={t("reset.title")} description={t("reset.descriptionEmail", { target: status.maskedEmail })} />
        <ResetWithTokenForm token={token} minPasswordLength={minPasswordLength} />
      </div>
    );
  }

  const flow = await readAuthFlow();
  if (flow?.kind !== "reset") {
    return <RequestNewLink title={t("reset.startTitle")} body={t("reset.startBody")} cta={t("reset.requestNew")} />;
  }
  return (
    <div className="space-y-6">
      <AuthHeading title={t("reset.title")} description={t("reset.descriptionSms", { target: maskPhone(flow.target) })} />
      <ResetWithCodeForm resendAvailableAt={flow.resendAvailableAt} initiallyCooling={isResendCoolingDown(flow)} minPasswordLength={minPasswordLength} />
      <AuthLinks>
        <Link href="/forgot-password" className="font-medium text-teal-strong underline-offset-4 hover:underline">
          {t("reset.useDifferent")}
        </Link>
      </AuthLinks>
    </div>
  );
}
