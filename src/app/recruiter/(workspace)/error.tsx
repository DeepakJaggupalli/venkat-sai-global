"use client";

import { RecruiterRouteError } from "@/components/recruiter/route-error";

/** Any Partner Portal page without its own boundary (the menu stays). */
export default function RecruiterWorkspaceError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <RecruiterRouteError area="this page" reset={reset} retry={retry} digest={error.digest} />;
}
