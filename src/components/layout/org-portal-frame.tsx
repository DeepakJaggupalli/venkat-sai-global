import "server-only";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PORTAL_LABEL } from "@/config/navigation";
import { BRAND } from "@/config/site";
import type { OrgContext } from "@/modules/identity/authz";

import { OrgStatusBanner } from "./org-status-banner";
import type { OrgPortalKey } from "./portal-config";
import { PortalShell } from "./portal-shell";
import { getOrgShellData, getPortalLinks, readSidebarCollapsed, toShellUser } from "./shell-data";

/** Title template + noindex for an org portal's (workspace) layout. */
export function orgPortalMetadata(portal: OrgPortalKey): Metadata {
  const label = PORTAL_LABEL[portal];
  return {
    title: { default: label, template: `%s · ${label} | ${BRAND.name}` },
    robots: { index: false, follow: false },
  };
}

/**
 * Portal shell for an employer / partner / institution workspace. The caller (layout) must already have
 * authorised the member with requireOrgMember() and passes that context in; this only loads display data
 * (portal links, organisation switcher, sidebar preference) and adds the verification status banner.
 */
export async function OrgPortalFrame({ portal, ctx, children }: { portal: OrgPortalKey; ctx: OrgContext; children: ReactNode }) {
  const [portals, org, collapsed] = await Promise.all([getPortalLinks(ctx.user), getOrgShellData(ctx), readSidebarCollapsed()]);
  return (
    <PortalShell
      portal={portal}
      user={toShellUser(ctx.user)}
      portals={portals}
      permissions={Array.from(ctx.permissions)}
      organization={org.organization}
      memberships={org.memberships}
      defaultCollapsed={collapsed}
      banner={<OrgStatusBanner portal={portal} status={ctx.organization.status} />}
    >
      {children}
    </PortalShell>
  );
}
