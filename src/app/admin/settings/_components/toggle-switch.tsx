"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/actions";

/**
 * Switch bound to a Server Action `(enabled) => ActionResult`. Optimistic, with rollback and a toast on
 * failure. `confirmOff` asks before switching something off (e.g. a whole portal).
 */
export function ToggleSwitch({
  checked,
  label,
  action,
  disabled,
  confirmOff,
  testId,
}: {
  checked: boolean;
  label: string;
  action: (enabled: boolean) => Promise<ActionResult<unknown>>;
  disabled?: boolean;
  confirmOff?: { title: string; description: string };
  testId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = (next: boolean) =>
    start(async () => {
      setOptimistic(next);
      const result = await action(next);
      if (result.ok) {
        toast.success(result.message ?? (next ? "Switched on" : "Switched off"));
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <>
      <Switch
        checked={optimistic}
        aria-label={label}
        disabled={disabled}
        aria-busy={pending || undefined}
        data-testid={testId}
        onCheckedChange={(next) => {
          if (pending) return;
          if (!next && confirmOff) setConfirmOpen(true);
          else run(next);
        }}
      />
      {confirmOff ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmOff.title}
          description={confirmOff.description}
          confirmLabel="Switch off"
          variant="destructive"
          onConfirm={async () => {
            const result = await action(false);
            return result;
          }}
          onSuccess={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
