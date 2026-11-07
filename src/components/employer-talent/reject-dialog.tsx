"use client";

import type { FormEvent } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { transitionApplicationAction } from "@/modules/recruitment/actions";
import { REJECTION_REASON_LABELS, REJECTION_REASON_OPTIONS } from "@/modules/recruitment/constants";

import { textOf, useRunAction } from "./use-run-action";

const REASONS = REJECTION_REASON_OPTIONS.map((value) => ({ value, label: REJECTION_REASON_LABELS[value] }));
const DEFAULT_MESSAGE = "Thank you for your interest in this role. After careful review, we will not be taking your application further at this time. We wish you success in your search.";

/**
 * Reject with a structured internal reason and a separate, candidate-safe message. The internal reason
 * and notes are never shown to the candidate.
 */
export function RejectDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  rejectStageKey,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
  rejectStageKey: string;
  onDone?: (result: ActionResult<unknown>) => void;
}) {
  // Success closes through the parent's onOpenChange directly; the dialog's own close (Esc, overlay,
  // close button) therefore always means "cancelled".
  const reject = useRunAction(transitionApplicationAction, { onSuccess: () => onOpenChange(false) });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = textOf(form, "rejectionReasonCode");
    const result = await reject.run({
      portal: "employer",
      applicationId,
      toStageKey: rejectStageKey,
      rejectionReasonCode: (code ?? null) as (typeof REJECTION_REASON_OPTIONS)[number] | null,
      rejectionReason: textOf(form, "rejectionReason") ?? null,
      internalNote: textOf(form, "rejectionReason") ?? null,
      candidateVisibleNote: textOf(form, "candidateVisibleNote") ?? null,
    });
    if (result.ok) onDone?.(result);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onDone?.({ ok: false, error: "Not rejected. The candidate stays where they were." });
          reject.reset();
        }
        onOpenChange(next);
      }}
      title={`Reject ${candidateName}?`}
      description="Interviews still scheduled are cancelled and open offers withdrawn. The candidate sees only the message below."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={reject.state} />
        <FormField label="Reason (internal)" name="rejectionReasonCode" required state={reject.state}>
          <SimpleSelect options={REASONS} placeholder="Choose a reason" required />
        </FormField>
        <FormField label="Details for your team" name="rejectionReason" optional state={reject.state} hint="Visible to your organisation and the Venkat Sai team only.">
          <Textarea rows={3} maxLength={2000} />
        </FormField>
        <FormField label="Message to the candidate" name="candidateVisibleNote" optional state={reject.state} hint="Keep it respectful. Do not include internal reasons or personal remarks.">
          <Textarea rows={4} maxLength={2000} defaultValue={DEFAULT_MESSAGE} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pending={reject.pending} pendingLabel="Rejecting…" variant="destructive">
            Reject application
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
