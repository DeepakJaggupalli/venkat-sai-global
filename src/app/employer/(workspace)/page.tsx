import type { Metadata } from "next";

import { BusinessSetupDashboard } from "@/components/layout/setup-dashboards";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Dashboard" };

/** Employer Portal home — PLACEHOLDER until the employer dashboard ships (owned by the Employer Portal team). */
export default async function EmployerHomePage() {
  const ctx = await requireOrgMember("employer");
  return (
    <BusinessSetupDashboard
      portal="employer"
      userName={ctx.user.displayName}
      permissions={Array.from(ctx.permissions)}
      organizationName={ctx.organization.name}
      roleName={ctx.role.name}
    />
  );
}
