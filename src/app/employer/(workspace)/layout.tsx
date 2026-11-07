import type { ReactNode } from "react";

import { OrgPortalFrame, orgPortalMetadata } from "@/components/layout/org-portal-frame";
import { assertPortalEnabled } from "@/components/layout/shell-data";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata = orgPortalMetadata("employer");

/**
 * Employer Portal workspace. Members without an employer organisation are sent to /employer/onboarding
 * (outside this group, so it renders without the shell). Pages and actions must still call
 * requireOrgMember("employer", permission) themselves.
 */
export default async function EmployerWorkspaceLayout({ children }: { children: ReactNode }) {
  await assertPortalEnabled("employer");
  const ctx = await requireOrgMember("employer");
  await assertPortalEnabled("employer", { organizationId: ctx.organization.id });
  return (
    <OrgPortalFrame portal="employer" ctx={ctx}>
      {children}
    </OrgPortalFrame>
  );
}
