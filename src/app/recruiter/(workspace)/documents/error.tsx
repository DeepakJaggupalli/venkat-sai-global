"use client";

import { RecruiterRouteError } from "@/components/recruiter/route-error";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RecruiterRouteError area="document requests" reset={reset} digest={error.digest} />;
}
