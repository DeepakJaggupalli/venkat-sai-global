"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * Last-resort error screen for pages outside a portal (and for errors in a portal layout itself). Portal pages
 * have their own boundaries that keep the menu. Plain words, Try again, a way home, WhatsApp and the reference.
 */
export default function ErrorPage({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="container-page flex min-h-[70dvh] flex-col items-center justify-center focus:outline-none">
      <RouteError reset={reset} retry={retry} digest={error.digest} />
    </main>
  );
}
