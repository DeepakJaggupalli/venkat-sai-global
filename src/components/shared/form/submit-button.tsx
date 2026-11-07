"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, "type" | "asChild"> & {
  children: ReactNode;
  /** Label while the form is submitting, e.g. "Saving…". */
  pendingLabel?: ReactNode;
  /** Extra pending flag (e.g. the third value of useActionState) for buttons outside the form. */
  pending?: boolean;
};

/**
 * Submit button that reflects the parent <form>'s pending state (useFormStatus). While pending it
 * stays focusable (aria-disabled) so keyboard focus is not lost, ignores repeat clicks and shows a
 * spinner; the status change is announced politely.
 *
 *   <form action={formAction}> … <SubmitButton pendingLabel="Saving…">Save job</SubmitButton></form>
 */
export function SubmitButton({ children, pendingLabel, pending: pendingProp, disabled, className, onClick, ...props }: SubmitButtonProps) {
  const status = useFormStatus();
  const pending = Boolean(pendingProp || status.pending);
  return (
    <Button
      {...props}
      type="submit"
      disabled={disabled}
      aria-disabled={pending || undefined}
      data-pending={pending || undefined}
      className={cn("min-w-24", pending && "cursor-wait opacity-80", className)}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {pending ? <Spinner aria-hidden="true" role="presentation" /> : null}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
      <span aria-live="polite" className="sr-only">
        {pending ? "Submitting" : ""}
      </span>
    </Button>
  );
}
