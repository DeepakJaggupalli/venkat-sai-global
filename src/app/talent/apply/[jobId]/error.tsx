"use client";

import { JobsRouteError } from "@/components/jobs/route-error";

export default function ApplyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <JobsRouteError error={error} reset={reset} backHref="/talent/jobs" />;
}
