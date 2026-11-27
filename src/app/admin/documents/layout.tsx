import type { ReactNode } from "react";

import { requireStaff } from "@/modules/identity/authz";

/** Certificates and letters hold personal details: training.certificates before anything streams. Pages check again. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireStaff("training.certificates");
  return children;
}
