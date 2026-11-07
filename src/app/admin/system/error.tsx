"use client";

import { AdminRouteError } from "@/components/admin/route-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminRouteError area="system status" reset={reset} digest={error.digest} />;
}
