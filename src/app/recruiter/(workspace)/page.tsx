import type { Metadata } from "next";

import { BusinessSetupDashboard } from "@/components/layout/setup-dashboards";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Dashboard" };

/** Partner Portal home — PLACEHOLDER until the partner dashboard ships (owned by the Partner Portal team). */
export default async function RecruiterHomePage() {
  const ctx = await requireOrgMember("recruitment_partner");
  return (
    <BusinessSetupDashboard
      portal="recruiter"
      userName={ctx.user.displayName}
      permissions={Array.from(ctx.permissions)}
      organizationName={ctx.organization.name}
      roleName={ctx.role.name}
    />
  );
}
