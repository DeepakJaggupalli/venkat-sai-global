import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/site";

/**
 * Minimal frame for the shared billing pages (/billing/**): brand header, main landmark, no portal chrome, so
 * the same page works for employers, partners, institutions, individual buyers and staff — and prints cleanly.
 */
export function BillingFrame({ children, actions, width = "narrow" }: { children: ReactNode; actions?: ReactNode; width?: "narrow" | "wide" }) {
  const max = width === "wide" ? "max-w-5xl" : "max-w-2xl";
  return (
    <div lang="en" className="flex min-h-dvh flex-col bg-surface-subtle print:bg-white">
      <header className="border-b border-border bg-white print:hidden">
        <div className={`mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 ${max}`}>
          <Link href="/" aria-label={`${BRAND.name} home`} className="rounded-md">
            <Logo decorative className="h-8 w-auto" />
          </Link>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={`mx-auto w-full flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-10 print:max-w-none print:p-0 ${max}`}>
        {children}
      </main>
    </div>
  );
}
