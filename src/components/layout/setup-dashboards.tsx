import { NAVIGATION, PORTAL_HOME, PORTAL_LABEL, type PortalKey } from "@/config/navigation";

import { filterNavSections, quickLinks } from "./nav-utils";
import { PortalSetupDashboard } from "./portal-setup-dashboard";

/**
 * English placeholder dashboards for the business portals (employer, partner, institution, Command
 * Centre). The People Portal builds its own, translated, from PortalSetupDashboard.
 */

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

export function BusinessSetupDashboard({
  portal,
  userName,
  permissions,
  organizationName,
  roleName,
}: {
  portal: Exclude<PortalKey, "talent">;
  userName: string;
  /** Viewer's permission keys — quick links only include pages they can open. */
  permissions: readonly string[];
  organizationName?: string | null;
  roleName?: string | null;
}) {
  const label = PORTAL_LABEL[portal];
  const links = quickLinks(filterNavSections(NAVIGATION[portal], permissions), PORTAL_HOME[portal]).map((item) => ({
    title: item.title,
    href: item.href,
    icon: item.icon,
  }));
  const context = organizationName ? [organizationName, roleName].filter(Boolean).join(" · ") : roleName || null;

  return (
    <PortalSetupDashboard
      eyebrow={label}
      title={`Welcome, ${firstName(userName)}`}
      context={context}
      statusTitle="Your dashboard is being set up"
      statusDescription={`We're preparing the ${label} dashboard. In the meantime, use the links below to get started.`}
      linksTitle="Get started"
      links={links}
    />
  );
}
