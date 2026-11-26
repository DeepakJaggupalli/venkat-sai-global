import type { Metadata } from "next";

import { PortalHelpPage } from "@/components/help/portal-help-page";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "How to use" };

/** Command Centre guide: only the areas the viewer's role can open. */
export default async function AdminHelpPage() {
  const staff = await requireStaff();
  return <PortalHelpPage portal="admin" permissions={staff.permissions} />;
}
