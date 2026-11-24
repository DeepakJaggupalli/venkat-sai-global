import type { ReactNode } from "react";

import { requireStaff } from "@/modules/identity/authz";

/**
 * Authorises before the loading skeleton streams, so a missing permission answers with a real 403. Pages and actions
 * still check for themselves (creating needs commercial.invoices).
 */
export default async function WorkerInvoicesLayout({ children }: { children: ReactNode }) {
  await requireStaff("commercial.view");
  return children;
}
