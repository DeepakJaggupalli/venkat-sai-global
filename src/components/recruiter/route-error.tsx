"use client";

import { useEffect } from "react";

import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";
import { track } from "@/modules/analytics/client";

/** Shared error boundary body for Partner Portal routes: honest message, retry, no internals. */
export function RecruiterRouteError({ area, reset, digest }: { area: string; reset: () => void; digest?: string }) {
  useEffect(() => {
    track("error_shown", { area });
  }, [area]);
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <Callout tone="danger" title={`We could not load ${area}`} live="assertive">
        Something went wrong on our side. Try again, and contact Venkat Sai support if it keeps happening{digest ? ` (reference ${digest})` : ""}.
      </Callout>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/recruiter">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
