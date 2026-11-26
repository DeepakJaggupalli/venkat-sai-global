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
  /**
   * Show the spinner and pending label while pending (default true). A form with several submit buttons passes
   * false on the buttons that were not clicked: they still ignore clicks while the form is busy, but only the
   * clicked one says "Saving…" or "Submitting…". React marks the whole form pending (useFormStatus), so without
   * this every submit button of the form would show its own pending label at once.
   */
  indicator?: boolean;
};

/**
 * Submit button that reflects the parent <form>'s pending state (useFormStatus). While pending it
 * stays focusable (aria-disabled) so keyboard focus is not lost, ignores repeat clicks and shows a
 * spinner; the status change is announced politely.
 *
 *   <form action={formAction}> … <SubmitButton pendingLabel="Saving…">Save job</SubmitButton></form>
 */
export function SubmitButton({ children, pendingLabel, pending: pendingProp, indicator = true, disabled, className, onClick, ...props }: SubmitButtonProps) {
  const status = useFormStatus();
  const pending = Boolean(pendingProp || status.pending);
  const busy = pending && indicator;
  // The live region sits next to the button, not inside it: modal dialogs (aria-hidden's hideOthers) keep
  // [aria-live] elements exposed and hide their siblings, which stripped the label from every submit button
  // behind an open dialog (axe "button-name"). It comes first so `space-y-*` parents add no margin to the button.
  return (
    <>
      <span aria-live="polite" className="sr-only">
        {busy ? "Submitting" : ""}
      </span>
      <Button
        {...props}
        type="submit"
        disabled={disabled}
        aria-disabled={pending || undefined}
        data-pending={pending || undefined}
        className={cn("min-w-24", pending && "cursor-wait", busy && "opacity-80", className)}
        onClick={(event) => {
          if (pending) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        {busy ? <Spinner aria-hidden="true" role="presentation" /> : null}
        <span>{busy && pendingLabel ? pendingLabel : children}</span>
      </Button>
    </>
  );
}
