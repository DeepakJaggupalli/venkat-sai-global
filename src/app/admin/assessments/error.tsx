"use client";

import { RouteError } from "../pipeline/_shared/route-error";

export default function Error({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <RouteError reset={reset} retry={retry} digest={error.digest} />;
}
