import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";

/** Institution onboarding sits outside the workspace shell (no organisation yet): a calm, focused frame. */
export default function InstitutionOnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div lang="en" className="min-h-dvh bg-surface-subtle">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <Logo title="Venkat Sai Global home" className="h-8 w-auto" />
          </Link>
          <Link href="/account" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Your account
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}
