"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { completeManualRefundAction, resubmitRefundAction, retryRefundAction, updateDisputeAction } from "@/modules/commercial/actions";

/** Offline refunds: finance pays the money back and records the payout reference. */
export function CompleteRefundForm({ refundId, today }: { refundId: string; today: string }) {
  const { state, pending, onSubmit } = useBillingForm(completeManualRefundAction);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Complete refund">
      <input type="hidden" name="refundId" value={refundId} />
      <FormErrorAlert state={state} fieldLabels={{ reference: "Payout reference", processedAt: "Paid on" }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Payout reference" name="reference" required state={state} hint="Bank UTR or UPI reference of the money sent back.">
          <Input maxLength={100} autoComplete="off" />
        </FormField>
        <FormField label="Paid on" name="processedAt" required state={state}>
          <Input type="date" defaultValue={today} max={today} />
        </FormField>
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Mark refund completed
      </SubmitButton>
      <p className="text-xs text-muted-foreground">A GST credit note is issued automatically and the customer is notified.</p>
    </form>
  );
}

export function RetryRefundButton({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await retryRefundAction({ refundId });
          if (r.ok) {
            toast.success(r.message ?? "Queued");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      Retry gateway refund
    </Button>
  );
}

export function ResubmitRefundForm({ refundId, defaultReason }: { refundId: string; defaultReason: string }) {
  const { state, pending, onSubmit } = useBillingForm(resubmitRefundAction);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Resubmit refund">
      <input type="hidden" name="refundId" value={refundId} />
      <FormErrorAlert state={state} />
      <FormField label="Amount" name="amount" optional state={state} hint="Blank keeps the current amount.">
        <Input inputMode="decimal" maxLength={20} />
      </FormField>
      <FormField label="Reason" name="reason" optional state={state}>
        <Textarea rows={2} maxLength={1000} defaultValue={defaultReason} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Sending…" variant="outline">
        Resubmit for approval
      </SubmitButton>
    </form>
  );
}

export function DisputeDecisionForm({ disputeId, status, resolution }: { disputeId: string; status: string; resolution: string | null }) {
  const { state, pending, onSubmit } = useBillingForm(updateDisputeAction);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Update dispute">
      <input type="hidden" name="disputeId" value={disputeId} />
      <FormErrorAlert state={state} fieldLabels={{ status: "Status", resolution: "Answer to the customer" }} />
      <FormField label="Status" name="status" required state={state}>
        {(field) => <SimpleSelect {...field} options={OPTIONS.disputeStatus} defaultValue={status} />}
      </FormField>
      <FormField label="Answer to the customer" name="resolution" optional state={state} hint="Shown to the organisation in its billing area. Do not include internal notes.">
        <Textarea rows={3} maxLength={2000} defaultValue={resolution ?? ""} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
