"use client";

import { RouteError } from "@/components/shared/route-error";

/** Any Command Centre page without its own boundary: the friendly error inside the shell (menu stays). */
export default function AdminError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <RouteError reset={reset} retry={retry} digest={error.digest} homeHref="/admin" audience="staff" />;
}
