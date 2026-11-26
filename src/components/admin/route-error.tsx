"use client";

import { RouteError } from "@/components/shared/route-error";

/** Shared error boundary body for Command Centre routes: honest message, retry, no internals. */
export function AdminRouteError({ area, reset, retry, digest }: { area: string; reset?: () => void; retry?: () => void; digest?: string }) {
  return <RouteError area={area} reset={reset} retry={retry} digest={digest} homeHref="/admin" audience="staff" />;
}
