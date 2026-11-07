import type { Metadata } from "next";

import { PortalSetupDashboard } from "@/components/layout/portal-setup-dashboard";
import { quickLinks } from "@/components/layout/nav-utils";
import { NAVIGATION, PORTAL_HOME } from "@/config/navigation";
import { getT } from "@/i18n/server";
import { requireUser } from "@/modules/identity/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("common");
  return { title: t("nav.dashboard") };
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

/**
 * People Portal home — PLACEHOLDER until the talent dashboard ships (owned by the People Portal team).
 * Shows the user's real name and links into the portal; no sample data.
 */
export default async function TalentHomePage() {
  const user = await requireUser();
  const t = await getT("common");
  const links = quickLinks(NAVIGATION.talent, PORTAL_HOME.talent).map((item) => ({
    title: item.i18nKey ? t(item.i18nKey) : item.title,
    href: item.href,
    icon: item.icon,
  }));

  return (
    <PortalSetupDashboard
      eyebrow={t("portal.talent")}
      title={t("setup.welcome", { name: firstName(user.displayName) })}
      statusTitle={t("setup.title")}
      statusDescription={t("setup.description")}
      linksTitle={t("setup.quickLinks")}
      links={links}
    />
  );
}
