import type { Metadata } from "next";

import { PortalHelpPage } from "@/components/help/portal-help-page";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "How to use" };

/** Institution Portal guide: only the areas the member's role can open. */
export default async function InstitutionHelpPage() {
  const ctx = await requireOrgMember("institution");
  return <PortalHelpPage portal="institution" permissions={ctx.permissions} />;
}
