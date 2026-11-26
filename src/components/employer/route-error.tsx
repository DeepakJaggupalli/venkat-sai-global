"use client";

import { useEffect } from "react";

import { RouteError } from "@/components/shared/route-error";
import { track } from "@/modules/analytics/client";

/** Shared error boundary body for Employer Portal routes: honest message, retry, no internals. */
export function EmployerRouteError({ area, reset, retry, digest }: { area: string; reset?: () => void; retry?: () => void; digest?: string }) {
  useEffect(() => {
    track("error_shown", { area });
  }, [area]);
  return <RouteError area={area} reset={reset} retry={retry} digest={digest} />;
}
