import type { Metadata } from "next";

import { PortalHelpPage } from "@/components/help/portal-help-page";
import { requireOrgMember } from "@/modules/identity/authz";
import { employerKindOf, portalForEmployerKind } from "@/modules/organizations/employer-kind";

export const metadata: Metadata = { title: "How to use" };

/** Company Portal guide at /employer/help; Travel Agency Portal guide at /agency/help (same route, by kind). */
export default async function EmployerHelpPage() {
  const ctx = await requireOrgMember("employer");
  const portal = portalForEmployerKind(employerKindOf(ctx.organization) ?? "direct_company");
  return <PortalHelpPage portal={portal} permissions={ctx.permissions} />;
}
