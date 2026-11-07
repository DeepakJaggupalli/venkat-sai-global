"use client";

import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";

/** Error boundary body for billing routes. Never shows technical details. */
export function BillingError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Callout tone="danger" title="Billing could not be loaded" live="polite">
        <p>Something went wrong while loading this page. Nothing has been charged or changed.</p>
        <Button className="mt-4" variant="outline" onClick={reset}>
          Try again
        </Button>
      </Callout>
    </div>
  );
}
