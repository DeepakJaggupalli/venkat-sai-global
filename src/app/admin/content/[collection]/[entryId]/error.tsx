"use client";

import { RouteError } from "@/components/shared/route-error";

export default function EntryError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return (
    <RouteError
      reset={reset}
      retry={retry}
      digest={error.digest}
      homeHref="/admin/content"
      homeLabel="Back to content"
      audience="staff"
      labels={{ title: "The editor could not be opened", body: "Your saved versions are safe. Try again, or go back to the content list." }}
    />
  );
}
