import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PortalShell } from "@/components/layout/portal-shell";
import { getPortalLinks, readSidebarCollapsed, toShellUser } from "@/components/layout/shell-data";
import { PORTAL_LABEL } from "@/config/navigation";
import { BRAND } from "@/config/site";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = {
  title: { default: PORTAL_LABEL.admin, template: `%s · ${PORTAL_LABEL.admin} | ${BRAND.name}` },
  robots: { index: false, follow: false },
};

/**
 * Venkat Sai Command Centre. Any staff member may enter; the sidebar shows only the areas their
 * permissions allow, and every page/action must still call requireStaff(permission) itself.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const [portals, collapsed] = await Promise.all([getPortalLinks(staff.user), readSidebarCollapsed()]);
  return (
    <PortalShell
      portal="admin"
      user={toShellUser(staff.user)}
      portals={portals}
      permissions={Array.from(staff.permissions)}
      defaultCollapsed={collapsed}
    >
      {children}
    </PortalShell>
  );
}
