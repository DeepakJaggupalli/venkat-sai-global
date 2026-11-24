import type { ReactNode } from "react";

import { requireStaff } from "@/modules/identity/authz";

/** Authorises before the loading skeleton streams, so a missing permission answers with a real 403. The page checks again. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireStaff("candidates.manage");
  return children;
}
