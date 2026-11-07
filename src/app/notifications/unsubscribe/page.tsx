import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/site";
import { sp, type SearchParams } from "@/lib/http";
import { CHANNEL_LABELS } from "@/modules/notifications/catalog";
import { describeUnsubscribeToken } from "@/modules/notifications/service";

import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
  // The token is in the URL: never send it to other sites.
  referrer: "no-referrer",
};

/**
 * /notifications/unsubscribe?token=… — target of the unsubscribe link in notification emails. Verifies the
 * signed token (read-only, so link scanners cannot unsubscribe anyone), names the category and asks for
 * confirmation. No sign-in needed: the token identifies the person and the category.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = sp(params, "token") ?? "";
  const info = describeUnsubscribeToken(token);

  return (
    <div lang="en" className="flex min-h-dvh flex-col bg-surface-subtle">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/" aria-label={`${BRAND.name} home`} className="rounded-md">
            <Logo decorative className="h-8 w-auto" />
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 focus:outline-none sm:px-6 sm:py-16">
        <div className="w-full max-w-lg rounded-xl border border-border bg-white p-6 shadow-xs sm:p-8">
          {info.ok ? (
            <UnsubscribeForm token={token} categoryLabel={info.categoryLabel} channelLabel={CHANNEL_LABELS[info.channel]} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden />
                <div className="space-y-2">
                  <h1 className="font-heading text-xl font-semibold text-navy">
                    {info.reason === "expired" ? "This unsubscribe link has expired" : "This unsubscribe link is not valid"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {info.reason === "expired"
                      ? "Unsubscribe links stop working after a year. Sign in to choose which notifications you receive."
                      : "The link may be incomplete. Copy the whole link from the email, or sign in to choose which notifications you receive."}
                  </p>
                </div>
              </div>
              <Button asChild>
                <Link href="/account/notifications/preferences">Manage notification preferences</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
