import type { ReactNode } from "react";

import { LinkTabs } from "@/components/shared/link-tabs";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { commercialNav } from "./_lib/nav";

/**
 * Revenue administration area of the Command Centre. Section tabs follow the viewer's permissions;
 * every page and action still authorises itself.
 */
export default async function CommercialLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff(["commercial.view", "partners.settlements"], "any");
  const items = commercialNav.filter((item) => staffCan(staff, item.permission));
  return (
    <div className="space-y-6">
      <LinkTabs items={items.map(({ href, label, match }) => ({ href, label, match }))} label="Revenue and billing sections" />
      {children}
    </div>
  );
}
