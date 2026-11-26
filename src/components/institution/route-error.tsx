"use client";

import { useEffect } from "react";

import { RouteError } from "@/components/shared/route-error";
import { track } from "@/modules/analytics/client";

/** Shared error boundary body for Institution Portal routes: honest message, retry, no internals. */
export function InstitutionRouteError({ area, reset, retry, digest }: { area: string; reset?: () => void; retry?: () => void; digest?: string }) {
  useEffect(() => {
    track("error_shown", { area: `institution_${area.replace(/\W+/g, "_")}` });
  }, [area]);
  return <RouteError area={area} reset={reset} retry={retry} digest={digest} homeHref="/institution" />;
}
