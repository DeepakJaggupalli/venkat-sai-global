"use client";

import { InstitutionRouteError } from "@/components/institution/route-error";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <InstitutionRouteError area="announcements" reset={reset} digest={error.digest} />;
}
