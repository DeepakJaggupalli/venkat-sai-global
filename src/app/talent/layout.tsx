import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PortalShell } from "@/components/layout/portal-shell";
import { assertPortalEnabled, getPortalLinks, readSidebarCollapsed, toShellUser } from "@/components/layout/shell-data";
import { BRAND } from "@/config/site";
import { I18nProvider } from "@/i18n/client";
import { NAMESPACES } from "@/i18n/config";
import { getClientMessages, getT } from "@/i18n/server";
import { requireUser } from "@/modules/identity/session";

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
