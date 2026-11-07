"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { closeMyTicketAction, rateMyTicketAction } from "@/modules/operations/actions";

const RATING_LABELS = ["Very poor", "Poor", "Okay", "Good", "Excellent"] as const;

/** Satisfaction rating (1–5) after a request is resolved. A radio group of stars, each with a text label. */
export function TicketRatingForm({ ticketId }: { ticketId: string }) {
  const [rating, setRating] = useState(0);
  const [state, formAction] = useActionState(rateMyTicketAction, null);
  useActionToast(state, { successMessage: "Thank you for your feedback" });

  return (
    <form action={formAction} className="space-y-4" noValidate data-testid="ticket-rating-form">
      <FormErrorAlert state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-foreground">How satisfied are you with the help you received?</legend>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Rating">
          {RATING_LABELS.map((label, i) => {
            const value = i + 1;
            const selected = value <= rating;
            return (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="rating" value={value} className="peer sr-only" checked={rating === value} onChange={() => setRating(value)} />
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-lg border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                    selected ? "border-gold bg-gold-soft" : "border-border bg-card hover:bg-surface-subtle",
                  )}
                  title={label}
                >
                  <Star className={cn("size-5", selected ? "fill-gold text-gold-strong" : "text-muted-foreground")} aria-hidden="true" />
                  <span className="sr-only">
                    {value} – {label}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {rating ? `${rating} of 5 – ${RATING_LABELS[rating - 1]}` : "Choose a rating"}
        </p>
        {state?.ok === false && state.fieldErrors?.rating ? <p className="mt-1 text-sm text-destructive">Choose a rating</p> : null}
      </fieldset>
      <FormField label="Anything we could do better?" name="comment" optional state={state}>
        <Textarea rows={3} maxLength={2000} />
      </FormField>
      <SubmitButton pendingLabel="Sending…">Send feedback</SubmitButton>
    </form>
  );
}

/** The requester closes a request they no longer need. */
export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Close request</Button>}
      title="Close this request?"
      description="Close it if you no longer need help. You can raise a new request at any time."
      confirmLabel="Close request"
      onConfirm={closeMyTicketAction.bind(null, { ticketId })}
      successMessage="Request closed"
    />
  );
}
