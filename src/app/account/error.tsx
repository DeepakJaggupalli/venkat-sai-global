"use client";

import { RouteError } from "@/components/shared/route-error";

/** Account pages (profile, security, notifications, privacy). */
export default function AccountError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <RouteError reset={reset} retry={retry} digest={error.digest} homeHref="/account" homeLabel="Go to my account" />;
}
