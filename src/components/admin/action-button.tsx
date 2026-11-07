"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";

type BoundAction = () => Promise<ActionResult<unknown>>;

/**
 * One-click Command Centre action (a bound Server Action, e.g. `publishJobAction.bind(null, { id })`).
 * With `confirm` it asks first through ConfirmDialog. Results are toasted and the route refreshed.
 */
export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  confirm,
  icon,
  testId,
}: {
  action: BoundAction;
  children: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "default";
  confirm?: { title: string; description?: string; confirmLabel?: string; destructive?: boolean };
  icon?: ReactNode;
  testId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (confirm) {
    return (
      <ConfirmDialog
        trigger={
          <Button variant={variant} size={size} data-testid={testId}>
            {icon}
            {children}
          </Button>
        }
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.confirmLabel ?? "Confirm"}
        variant={confirm.destructive ? "destructive" : "default"}
        onConfirm={() => action()}
        onSuccess={() => router.refresh()}
      />
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      data-testid={testId}
      aria-disabled={pending || undefined}
      onClick={() => {
        if (pending) return;
        start(async () => {
          const result = await action();
          if (result.ok) {
            toast.success(result.message ?? "Done");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        });
      }}
    >
      {icon}
      {pending ? "Working…" : children}
    </Button>
  );
}
