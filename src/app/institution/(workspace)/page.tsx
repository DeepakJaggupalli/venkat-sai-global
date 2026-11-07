import type { Metadata } from "next";

import { BusinessSetupDashboard } from "@/components/layout/setup-dashboards";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Dashboard" };

/** Institution Portal home — PLACEHOLDER until the institution dashboard ships (owned by the Institution Portal team). */
export default async function InstitutionHomePage() {
  const ctx = await requireOrgMember("institution");
  return (
    <BusinessSetupDashboard
      portal="institution"
      userName={ctx.user.displayName}
      permissions={Array.from(ctx.permissions)}
      organizationName={ctx.organization.name}
      roleName={ctx.role.name}
    />
  );
}
