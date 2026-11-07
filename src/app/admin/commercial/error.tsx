"use client";

import { BillingError } from "@/components/billing/billing-error";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <BillingError reset={reset} />;
}
