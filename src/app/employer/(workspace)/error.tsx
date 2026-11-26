"use client";

import { EmployerRouteError } from "@/components/employer/route-error";

/** Any Company / Travel Agency Portal page without its own boundary (the menu stays). */
export default function EmployerWorkspaceError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <EmployerRouteError area="this page" reset={reset} retry={retry} digest={error.digest} />;
}
