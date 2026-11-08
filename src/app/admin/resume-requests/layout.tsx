import type { ReactNode } from "react";

import { requireStaff } from "@/modules/identity/authz";

/** Authorises before the loading skeleton streams (resume requests hold sensitive details: candidates.manage). Pages check again. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireStaff("candidates.manage");
  return children;
}
