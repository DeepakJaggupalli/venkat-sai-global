"use client";

import { useEffect } from "react";

import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";
import { track } from "@/modules/analytics/client";

/** Shared error boundary body for Institution Portal routes: honest message, retry, no internals. */
export function InstitutionRouteError({ area, reset, digest }: { area: string; reset: () => void; digest?: string }) {
  useEffect(() => {
    track("error_shown", { area: `institution_${area.replace(/\W+/g, "_")}` });
  }, [area]);
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <Callout tone="danger" title={`We could not load ${area}`} live="assertive">
        Something went wrong on our side. Try again, and contact Venkat Sai support if it keeps happening{digest ? ` (reference ${digest})` : ""}.
      </Callout>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/institution">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
