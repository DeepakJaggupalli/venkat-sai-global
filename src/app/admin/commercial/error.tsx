"use client";

import { BillingError } from "@/components/billing/billing-error";

export default function Error({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <BillingError reset={reset} retry={retry} digest={error.digest} />;
}
