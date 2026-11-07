"use client";

import { RouteError } from "../pipeline/_shared/route-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} digest={error.digest} />;
}
