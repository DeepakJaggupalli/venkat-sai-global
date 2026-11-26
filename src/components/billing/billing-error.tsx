"use client";

import { RouteError } from "@/components/shared/route-error";

/** Error boundary body for billing routes. Never shows technical details. */
export function BillingError({ reset, retry, digest }: { reset?: () => void; retry?: () => void; digest?: string }) {
  return (
    <RouteError
      area="billing"
      reset={reset}
      retry={retry}
      digest={digest}
      labels={{ body: "Something went wrong while loading this page. Nothing has been charged or changed. Try again in a moment." }}
    />
  );
}
