"use client";

import { JobsRouteError } from "@/components/jobs/route-error";

export default function ApplyError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <JobsRouteError error={error} reset={reset} retry={retry} backHref="/talent/jobs" />;
}
