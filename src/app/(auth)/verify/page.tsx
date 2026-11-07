import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { maskEmail, maskPhone } from "@/lib/format";
import { isResendCoolingDown, readAuthFlow } from "@/modules/identity/flow";

import { AuthHeading } from "../_components/auth-heading";
import { VerifyForm } from "../_components/code-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("verify.metaTitle"), robots: { index: false, follow: false } };
}

/** /verify — enter the code sent during sign-up or one-time-code sign-in. */
export default async function VerifyPage() {
  const [t, flow] = await Promise.all([getT("auth"), readAuthFlow()]);

  if (!flow || flow.kind === "reset") {
    return (
      <div className="space-y-6">
        <AuthHeading title={t("verify.expiredTitle")} description={t("verify.expiredBody")} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="h-10">
            <Link href="/sign-in">{t("verify.goToSignIn")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-10">
            <Link href="/sign-up">{t("verify.goToSignUp")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const masked = flow.channel === "email" ? maskEmail(flow.target) : maskPhone(flow.target);
  const carry = new URLSearchParams();
  if (flow.intent) carry.set("intent", flow.intent);
  if (flow.returnTo) carry.set("returnTo", flow.returnTo);
  const carried = carry.toString();
  const changeHref = `${flow.kind === "signup" ? "/sign-up" : "/sign-in"}${carried ? `?${carried}` : ""}`;

  return (
    <div className="space-y-6">
      <AuthHeading
        title={t(flow.kind === "signup" ? "verify.titleSignup" : "verify.titleLogin")}
        description={t(flow.channel === "email" ? "verify.sentEmail" : "verify.sentSms", { target: masked })}
      />
      <VerifyForm
        resendAvailableAt={flow.resendAvailableAt}
        initiallyCooling={isResendCoolingDown(flow)}
        changeHref={changeHref}
        changeLabel={t(flow.channel === "email" ? "verify.changeEmail" : "verify.changePhone")}
      />
      <p className="text-xs text-muted-foreground">{t(flow.channel === "email" ? "verify.helpEmail" : "verify.helpSms")}</p>
    </div>
  );
}
