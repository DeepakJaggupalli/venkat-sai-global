import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requestedEmployerPortal } from "@/components/layout/employer-portal";
import { EmployerPortalGuard } from "@/components/layout/employer-portal-guard";
import { OrgPortalFrame, orgPortalMetadata } from "@/components/layout/org-portal-frame";
import { assertPortalEnabled } from "@/components/layout/shell-data";
import { getOrgContext, requireOrgMember } from "@/modules/identity/authz";
import { currentPathForReturn, requireUser } from "@/modules/identity/session";
import { employerKindOf, employerOnboardingPath, employerPortalRedirect, portalForEmployerKind } from "@/modules/organizations/employer-kind";

/** "Company Portal" at /employer, "Travel Agency Portal" at /agency (rewritten here by src/proxy.ts). */
export async function generateMetadata(): Promise<Metadata> {
  return orgPortalMetadata(await requestedEmployerPortal());
}

/**
 * Employer workspace, serving two portals: the Company Portal (/employer) for direct companies and HR teams and the
 * Travel Agency Portal (/agency) for travel agencies. Members without an employer organisation are sent to that
 * portal's onboarding (outside this group, so it renders without the shell). A member opening the other portal is
 * redirected to the same page in their own (travel agency → /agency, direct company → /employer).
 * Pages and actions must still call requireOrgMember("employer", permission) themselves.
 */
export default async function EmployerWorkspaceLayout({ children }: { children: ReactNode }) {
  const requested = await requestedEmployerPortal();
  await assertPortalEnabled("employer");
  if (requested === "agency") {
    await requireUser();
    if (!(await getOrgContext("employer"))) redirect(employerOnboardingPath("travel_agency"));
  }
  const ctx = await requireOrgMember("employer");
  await assertPortalEnabled("employer", { organizationId: ctx.organization.id });

  const kind = employerKindOf(ctx.organization) ?? "direct_company";
  const elsewhere = employerPortalRedirect(await currentPathForReturn(), kind);
  if (elsewhere) redirect(elsewhere);
  const portal = portalForEmployerKind(kind);

  return (
    <OrgPortalFrame portal={portal} ctx={ctx}>
      <EmployerPortalGuard portal={portal} />
      {children}
    </OrgPortalFrame>
  );
}
