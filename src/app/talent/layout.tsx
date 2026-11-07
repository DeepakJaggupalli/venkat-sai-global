import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PortalShell } from "@/components/layout/portal-shell";
import { assertPortalEnabled, getPortalLinks, readSidebarCollapsed, toShellUser } from "@/components/layout/shell-data";
import { BRAND } from "@/config/site";
import { I18nProvider } from "@/i18n/client";
import { NAMESPACES } from "@/i18n/config";
import { getClientMessages, getT } from "@/i18n/server";
import { requireUser } from "@/modules/identity/session";

import { getAgeGateForUser, isOnboardingPath, ONBOARDING_PATH } from "./onboarding/_lib/state";

/** Shared words + every People Portal namespace, so client components can call useT() anywhere in /talent. */
const TALENT_NAMESPACES = NAMESPACES.filter((ns) => ns === "common" || ns.startsWith("talent-"));

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("common");
  const portal = t("portal.talent");
  return {
    title: { default: portal, template: `%s · ${portal} | ${BRAND.name}` },
    robots: { index: false, follow: false },
  };
}

/**
 * People Portal layout. Requires a signed-in user only — pages call requireCandidate() themselves
 * (it creates/loads the candidate profile). Navigation labels are translated (en / hi / te).
 */
export default async function TalentLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  await assertPortalEnabled("talent");

  // Age gate (CONVENTIONS 15.6, DPDP Rules 2025): until the date of birth is recorded — and, for a
  // child, a guardian consent granted — the People Portal only offers the onboarding age step.
  // Layouts do not re-render on client navigation inside /talent, so pages must not rely on this alone.
  const currentPath = (await headers()).get("x-vsg-pathname");
  if (currentPath && !isOnboardingPath(currentPath) && (await getAgeGateForUser(user.id)).state !== "complete") {
    redirect(ONBOARDING_PATH);
  }

  const [{ locale, messages }, portals, collapsed] = await Promise.all([
    getClientMessages(TALENT_NAMESPACES),
    getPortalLinks(user),
    readSidebarCollapsed(),
  ]);

  return (
    <I18nProvider locale={locale} messages={messages}>
      <PortalShell portal="talent" user={toShellUser(user)} portals={portals} locale={locale} defaultCollapsed={collapsed}>
        {children}
      </PortalShell>
    </I18nProvider>
  );
}
