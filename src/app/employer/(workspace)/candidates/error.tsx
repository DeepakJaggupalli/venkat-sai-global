"use client";

import { EmployerRouteError } from "@/components/employer/route-error";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EmployerRouteError area="candidate search" reset={reset} digest={error.digest} />;
}
