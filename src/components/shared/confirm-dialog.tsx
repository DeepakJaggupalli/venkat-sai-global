"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { useState, useTransition, type FormEvent, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { GENERIC_ERROR, interpretOutcome, isNavigationError } from "./form/action-result";
import { TONE_STYLES } from "./tones";

export type ConfirmCallback = (formData: FormData) => unknown | Promise<unknown>;

type ConfirmDialogProps = {
  /** Element that opens the dialog (rendered with asChild). Omit when controlling `open` yourself. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra fields inside the dialog's form (e.g. a required reason). Their values reach `onConfirm`. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  variant?: "default" | "destructive";
  /**
   * Runs on confirm. May be a Server Action (e.g. `archiveJob.bind(null, { id })`). Return an
   * ActionResult (or `false`) to report failure — the dialog stays open and shows the error.
   */
  onConfirm: ConfirmCallback;
  /** Toast shown on success when the result carries no message. Set `false` to disable toasts. */
  successMessage?: string | false;
  onSuccess?: () => void;
};

/**
 * Accessible confirmation (AlertDialog) for consequential actions, with async pending state.
 *
 *   <ConfirmDialog
 *     trigger={<Button variant="outline">Close job</Button>}
 *     title="Close this job?"
 *     description="Candidates will no longer be able to apply. You can reopen it later."
 *     confirmLabel="Close job"
 *     onConfirm={closeJob.bind(null, { id: job.id })}
 *   />
 */
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pendingLabel = "Working…",
  variant = "default",
  onConfirm,
  successMessage,
  onSuccess,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = openProp ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (pending && !next) return; // never close mid-request
    if (!next) setError(null);
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const outcome = interpretOutcome(await onConfirm(formData));
        if (!outcome.ok) {
          setError(outcome.error);
          return;
        }
        if (openProp === undefined) setInternalOpen(false);
        onOpenChange?.(false);
        const message = outcome.message ?? (successMessage === false ? undefined : successMessage);
        if (message) toast.success(message);
        onSuccess?.();
      } catch (err) {
        // Navigation errors from redirect()/notFound() must propagate to Next.js.
        if (isNavigationError(err)) throw err;
        setError(GENERIC_ERROR);
      }
    });
  };

  const destructive = variant === "destructive";
  const MediaIcon = destructive ? TriangleAlert : CircleAlert;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent
        className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md"
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit} className="grid gap-4" aria-busy={pending}>
          <AlertDialogHeader>
            <AlertDialogMedia className={cn(destructive ? "bg-danger-soft text-danger" : "bg-teal-soft text-teal-strong")}>
              <MediaIcon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-navy">{title}</AlertDialogTitle>
            {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          {children ? <div className="grid gap-3">{children}</div> : null}
          {error ? (
            <p role="alert" className={cn("rounded-lg px-3 py-2 text-sm", TONE_STYLES.danger.soft)}>
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              {cancelLabel}
            </AlertDialogCancel>
            <Button
              type="submit"
              aria-disabled={pending || undefined}
              onClick={(e) => {
                if (pending) e.preventDefault();
              }}
              className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30")}
            >
              {pending ? <Spinner aria-hidden="true" role="presentation" /> : null}
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
