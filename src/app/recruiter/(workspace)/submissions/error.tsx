"use client";

import { RecruiterRouteError } from "@/components/recruiter/route-error";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RecruiterRouteError area="your submissions" reset={reset} digest={error.digest} />;
}
