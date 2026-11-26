"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { employerPortalOfPath, inEmployerPortal, type EmployerPortal } from "@/modules/organizations/employer-kind";

/** Files and exports served by route handlers: leave those links to the browser. */
const FILE_LINK = /\/(pdf|export)(\/|$)|\.(pdf|csv|xlsx)$/i;

/**
 * The same-origin /employer/… path a plain left click on `target` would open, or null when the click should be left
 * alone (modifier keys, new tab, download, another site, a file, or a path outside the Company Portal).
 */
export function companyPortalLinkTarget(event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented" | "target">, origin: string): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target as Element | null;
  const anchor = typeof target?.closest === "function" ? target.closest("a[href]") : null;
  if (!anchor || anchor.tagName !== "A") return null;
  const link = anchor as HTMLAnchorElement;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(link.href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || FILE_LINK.test(url.pathname) || employerPortalOfPath(url.pathname) !== "employer") return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * /agency is served by the /employer routes, so a client-side navigation between the two (e.g. a page link to
 * /employer/jobs inside the Travel Agency Portal) reuses the already rendered workspace layout. When the browser URL
 * leaves this frame's portal, re-render from the server: the employer layout then applies the /agency vs /employer
 * rule (redirect) and brands the frame for the right portal. Renders nothing.
 *
 * In the Travel Agency Portal, plain clicks on in-page links to /employer/… go straight to the same page under
 * /agency/…, so the address bar never shows the Company Portal and there is no extra round trip for the redirect.
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

  useEffect(() => {
    if (portal !== "agency") return;
    function onClick(event: MouseEvent) {
      const path = companyPortalLinkTarget(event, window.location.origin);
      if (!path) return;
      // Capture phase on window runs before Next's <Link> handler, which would navigate to /employer/… first.
      event.preventDefault();
      event.stopPropagation();
      router.push(inEmployerPortal(path, "agency"));
    }
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [portal, router]);

  return null;
}
