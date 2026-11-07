import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/site";

import { AccountTabs } from "./account-tabs";
import type { PortalLink } from "./types";

/**
 * Frame for the shared account area (/account/**): brand, a link back to the portal the user came from,
 * and the account section tabs. Used by src/app/account/layout.tsx.
 */
export function AccountShell({ back, children }: { back: PortalLink | null; children: ReactNode }) {
  return (
    <div lang="en" className="flex min-h-dvh flex-col bg-surface-subtle">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link href="/" aria-label={`${BRAND.name} home`} className="shrink-0 rounded-md">
              <Logo layout="mark" decorative className="size-8 sm:hidden" />
              <Logo decorative className="hidden h-8 w-auto sm:block" />
            </Link>
            <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
            <p className="truncate font-heading text-sm font-semibold text-navy">Account</p>
          </div>
          {back && (
            <Link
              href={back.href}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-navy transition-colors hover:bg-surface-subtle"
            >
              <ArrowLeft className="size-4" aria-hidden />
              <span>
                <span className="hidden sm:inline">Back to </span>
                {back.label}
              </span>
            </Link>
          )}
        </div>
        <div className="mx-auto max-w-5xl px-1 sm:px-3 lg:px-5">
          <AccountTabs />
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-8 lg:py-10"
      >
        {children}
      </main>
    </div>
  );
}
