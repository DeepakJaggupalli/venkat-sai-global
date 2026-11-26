"use client";

import { AdminRouteError } from "@/components/admin/route-error";

export default function Error({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <AdminRouteError area="user accounts" reset={reset} retry={retry} digest={error.digest} />;
}
