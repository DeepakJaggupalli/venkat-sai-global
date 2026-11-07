import type { ReactNode } from "react";

import { OrgPortalFrame, orgPortalMetadata } from "@/components/layout/org-portal-frame";
import { assertPortalEnabled } from "@/components/layout/shell-data";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata = orgPortalMetadata("recruiter");

/**
 * Recruitment Partner Portal workspace. Members without a partner organisation are sent to
 * /recruiter/onboarding (outside this group). Pages and actions must still call
 * requireOrgMember("recruitment_partner", permission) themselves.
 */
export default async function RecruiterWorkspaceLayout({ children }: { children: ReactNode }) {
  await assertPortalEnabled("recruiter");
  const ctx = await requireOrgMember("recruitment_partner");
  await assertPortalEnabled("recruiter", { organizationId: ctx.organization.id });
  return (
    <OrgPortalFrame portal="recruiter" ctx={ctx}>
      {children}
    </OrgPortalFrame>
  );
}
