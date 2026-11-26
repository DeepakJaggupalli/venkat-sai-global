"use client";

import { RouteError as SharedRouteError } from "@/components/shared/route-error";

/** Shared error boundary body for the recruitment areas of the Command Centre (no internals shown). */
export function RouteError({ reset, retry, digest }: { reset?: () => void; retry?: () => void; digest?: string }) {
  return <SharedRouteError area="this page" reset={reset} retry={retry} digest={digest} homeHref="/admin" audience="staff" />;
}
