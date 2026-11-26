"use client";

import { RecruiterRouteError } from "@/components/recruiter/route-error";

export default function ErrorBoundary({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <RecruiterRouteError area="your settlements" reset={reset} retry={retry} digest={error.digest} />;
}
