import type { Metadata } from "next";

import { PortalHelpPage } from "@/components/help/portal-help-page";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "How to use" };

/** Partner Portal guide: only the areas the member's role can open. */
export default async function RecruiterHelpPage() {
  const ctx = await requireOrgMember("recruitment_partner");
  return <PortalHelpPage portal="recruiter" permissions={ctx.permissions} />;
}
