"use client";

import { InstitutionRouteError } from "@/components/institution/route-error";

export default function RouteError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <InstitutionRouteError area="reports" reset={reset} retry={retry} digest={error.digest} />;
}
