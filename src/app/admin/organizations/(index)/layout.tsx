import type { ReactNode } from "react";

import { requireStaff } from "@/modules/identity/authz";

/**
 * Authorises before the list's loading skeleton streams, so a missing permission answers with a real 403
 * (a check thrown inside the page would arrive after a 200 status). The page still checks for itself.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireStaff("orgs.view");
  return children;
}
