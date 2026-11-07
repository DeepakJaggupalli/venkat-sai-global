"use client";

import Link from "next/link";

import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";

/** Shared error boundary body for Command Centre routes: honest message, retry, no internals. */
export function AdminRouteError({ area, reset, digest }: { area: string; reset: () => void; digest?: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <Callout tone="danger" title={`We could not load ${area}`} live="assertive">
        Something went wrong while loading this page. Try again; if it keeps happening, report it with the reference
        {digest ? ` ${digest}` : " shown in the server log"}.
      </Callout>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/admin">Back to the dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
