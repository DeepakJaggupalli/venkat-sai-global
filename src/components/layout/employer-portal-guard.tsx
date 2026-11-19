"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { employerPortalOfPath, type EmployerPortal } from "@/modules/organizations/employer-kind";

/**
 * /agency is served by the /employer routes, so a client-side navigation between the two (e.g. a page link to
 * /employer/jobs inside the Travel Agency Portal) reuses the already rendered workspace layout. When the browser URL
 * leaves this frame's portal, re-render from the server: the employer layout then applies the /agency vs /employer
 * rule (redirect) and brands the frame for the right portal. Renders nothing.
 */
export function EmployerPortalGuard({ portal }: { portal: EmployerPortal }) {
  const pathname = usePathname();
  const router = useRouter();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    // The browser URL, not the router's view of a rewritten route.
    const browserPath = window.location.pathname;
    const current = employerPortalOfPath(browserPath);
    if (!current || current === portal || refreshedFor.current === browserPath) return;
    refreshedFor.current = browserPath;
    router.refresh();
  }, [pathname, portal, router]);

  return null;
}
