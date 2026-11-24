import type { ReactNode } from "react";

import { BOOKINGS_PERMISSION } from "@/modules/bookings/schemas";
import { requireStaff } from "@/modules/identity/authz";

/** Authorises before the loading skeleton streams, so a missing permission answers with a real 403. Pages check again. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireStaff(BOOKINGS_PERMISSION);
  return children;
}
