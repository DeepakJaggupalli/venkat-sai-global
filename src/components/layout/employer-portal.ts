import "server-only";

import { headers } from "next/headers";

import type { EmployerPortal } from "@/modules/organizations/employer-kind";

/** Set by src/proxy.ts (PORTAL_HEADER) on requests rewritten from /agency/… to the employer workspace. */
const PORTAL_HEADER = "x-vsg-portal";

/** Which employer portal this request was made to: "agency" for /agency/…, else "employer". */
export async function requestedEmployerPortal(): Promise<EmployerPortal> {
  const h = await headers();
  return h.get(PORTAL_HEADER) === "agency" ? "agency" : "employer";
}
