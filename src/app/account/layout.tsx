import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountShell } from "@/components/layout/account-shell";
import { getPortalLinks, pickBackPortal, readLastPortal } from "@/components/layout/shell-data";
import { BRAND } from "@/config/site";
import { requireUser } from "@/modules/identity/session";

export const metadata: Metadata = {
  title: { default: "Account", template: `%s · Account | ${BRAND.name}` },
  robots: { index: false, follow: false },
};

/**
 * Shared account area for every signed-in user (profile, security, notifications, privacy).
 * The back link returns to the portal the user last worked in (if they can still open it).
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [portals, lastPortal] = await Promise.all([getPortalLinks(user), readLastPortal()]);
  return <AccountShell back={pickBackPortal(portals, lastPortal)}>{children}</AccountShell>;
}
