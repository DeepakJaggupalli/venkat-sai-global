import type { Metadata } from "next";

import { BusinessSetupDashboard } from "@/components/layout/setup-dashboards";
import { humanize } from "@/lib/format";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Executive dashboard" };

/** Command Centre home — PLACEHOLDER until the executive dashboard ships (owned by the admin team). */
export default async function AdminHomePage() {
  const staff = await requireStaff();
  return (
    <BusinessSetupDashboard
      portal="admin"
      userName={staff.user.displayName}
      permissions={Array.from(staff.permissions)}
      roleName={staff.roleKeys.map(humanize).join(", ") || null}
    />
  );
}
