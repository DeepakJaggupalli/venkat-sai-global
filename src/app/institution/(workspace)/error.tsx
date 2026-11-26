"use client";

import { InstitutionRouteError } from "@/components/institution/route-error";

/** Any Institution Portal page without its own boundary (the menu stays). */
export default function InstitutionWorkspaceError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <InstitutionRouteError area="this page" reset={reset} retry={retry} digest={error.digest} />;
}
