"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { retryDeliveryAction } from "../actions";

export function RetryDeliveryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-disabled={pending || undefined}
      onClick={() =>
        start(async () => {
          const r = await retryDeliveryAction({ id });
          if (r.ok) toast.success(r.message ?? "Retry scheduled");
          else toast.error(r.error);
        })
      }
    >
      {pending ? "Scheduling…" : "Retry now"}
    </Button>
  );
}
