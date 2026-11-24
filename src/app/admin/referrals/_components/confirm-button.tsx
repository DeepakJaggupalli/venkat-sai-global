"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { TOUCH } from "./touch";

/**
 * A bound Server Action behind a phone-sized button (ActionButton with a 44px target on phones). With `confirm` it
 * asks first through ConfirmDialog; results are toasted and the page refreshed.
 */
export function ConfirmButton({
  action,
  children,
  icon,
  variant = "outline",
  confirm,
  testId,
  className,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost" | "destructive";
  confirm?: { title: string; description?: string; confirmLabel: string; destructive?: boolean };
  testId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const classes = cn(TOUCH, className);

  if (confirm) {
    return (
      <ConfirmDialog
        trigger={
          <Button variant={variant} size="sm" className={classes} data-testid={testId}>
            {icon}
            {children}
          </Button>
        }
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.confirmLabel}
        variant={confirm.destructive ? "destructive" : "default"}
        onConfirm={() => action()}
        onSuccess={() => router.refresh()}
      />
    );
  }

  return (
    <Button
      variant={variant}
      size="sm"
      className={classes}
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
