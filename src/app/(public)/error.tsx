"use client";

import { RouteError } from "@/components/shared/route-error";

/** Public website pages: the friendly error between the site header and footer. */
export default function PublicError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return (
    <div className="container-page">
      <RouteError reset={reset} retry={retry} digest={error.digest} homeHref="/" homeLabel="Go to the homepage" audience="external" />
    </div>
  );
}
