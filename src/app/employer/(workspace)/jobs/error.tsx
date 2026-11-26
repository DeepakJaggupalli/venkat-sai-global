"use client";

import { EmployerRouteError } from "@/components/employer/route-error";

export default function ErrorBoundary({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <EmployerRouteError area="your jobs" reset={reset} retry={retry} digest={error.digest} />;
}
