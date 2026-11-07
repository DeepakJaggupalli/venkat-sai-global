"use client";

import { RotateCcw } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";

/** Shared error boundary body for the recruitment areas of the Command Centre (no internals shown). */
export function RouteError({ reset, digest }: { reset: () => void; digest?: string }) {
  return (
    <div className="space-y-4 py-6">
      <Callout tone="danger" title="This page could not be loaded" live="assertive">
        Something went wrong while loading the data. Try again; if it keeps happening, share the reference below with the platform team.
        {digest ? <span className="mt-2 block font-mono text-xs">Reference: {digest}</span> : null}
      </Callout>
      <Button variant="outline" onClick={reset}>
        <RotateCcw aria-hidden="true" /> Try again
      </Button>
    </div>
  );
}
