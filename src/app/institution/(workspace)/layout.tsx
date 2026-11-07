import type { ReactNode } from "react";

import { OrgPortalFrame, orgPortalMetadata } from "@/components/layout/org-portal-frame";
import { assertPortalEnabled } from "@/components/layout/shell-data";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata = orgPortalMetadata("institution");

/**
 * Institution & Training Portal workspace. Members without an institution are sent to
 * /institution/onboarding (outside this group). Pages and actions must still call
 * requireOrgMember("institution", permission) themselves.
 */
export default async function InstitutionWorkspaceLayout({ children }: { children: ReactNode }) {
  await assertPortalEnabled("institution");
  const ctx = await requireOrgMember("institution");
  await assertPortalEnabled("institution", { organizationId: ctx.organization.id });
  return (
    <OrgPortalFrame portal="institution" ctx={ctx}>
      {children}
    </OrgPortalFrame>
  );
}
