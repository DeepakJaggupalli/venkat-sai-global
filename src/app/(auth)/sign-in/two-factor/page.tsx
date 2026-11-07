import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { getPortalAccess, portalHomePath } from "@/modules/identity/authz";
import { sanitizeReturnTo } from "@/modules/identity/redirects";
import { getCurrentSession } from "@/modules/identity/session";

import { AuthHeading } from "../../_components/auth-heading";
import { TwoFactorForm } from "../../_components/code-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("twoFactor.metaTitle"), robots: { index: false, follow: false } };
}

/** Second step of sign-in for accounts with two-factor authentication. */
export default async function TwoFactorChallengePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(sp(params, "returnTo"));
  const current = await getCurrentSession();
  if (!current) redirect(`/sign-in${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  if (!current.needsTwoFactor) redirect(returnTo ?? portalHomePath(await getPortalAccess(current.user)));

  const t = await getT("auth");
  return (
    <div className="space-y-6">
      <AuthHeading title={t("twoFactor.title")} description={t("twoFactor.description")} />
      <TwoFactorForm returnTo={returnTo} />
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">{t("twoFactor.help")}</p>
        <form action="/sign-out" method="post">
          <Button type="submit" variant="outline" size="lg" className="h-10 w-full sm:w-auto">
            {t("twoFactor.signOut")}
          </Button>
        </form>
      </div>
    </div>
  );
}
