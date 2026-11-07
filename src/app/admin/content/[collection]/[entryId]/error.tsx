"use client";

import { useEffect } from "react";

import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";

export default function EntryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Logged server-side already; keep the digest visible for support.
  }, [error]);
  return (
    <div className="space-y-4 py-8">
      <Callout tone="danger" title="The editor could not be opened">
        Your saved versions are safe. Try again, or go back to the collection.{error.digest ? ` Reference: ${error.digest}` : ""}
      </Callout>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
