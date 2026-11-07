"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { MoneyText } from "@/components/shared/money-text";
import { SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addSettlementLineAction,
  cancelSettlementAction,
  computeSettlementAction,
  markSettlementPaidAction,
  removeSettlementLineAction,
  resolveSettlementDisputeAction,
  submitSettlementAction,
  updateSettlementDraftAction,
} from "@/modules/commercial/actions";

type ComputeResult = {
  settlements: { id: string; code: string; currency: string; amountMinor: number; linesAdded: number }[];
  skipped: { placementId: string; placementCode: string; reason: string }[];
};

/** Generate (or top up) draft settlements for a partner and period — one draft per currency. */
export function ComputeSettlementForm({ partners }: { partners: SelectOption[] }) {
  const [result, setResult] = useState<ComputeResult | null>(null);
  const { state, pending, onSubmit } = useBillingForm<ComputeResult>(computeSettlementAction as never, { onSuccess: (data) => setResult(data ?? null) });
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Generate settlement">
        <FormErrorAlert state={state} fieldLabels={{ partnerOrganizationId: "Partner", periodStart: "From", periodEnd: "To" }} />
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <FormField label="Partner" name="partnerOrganizationId" required state={state}>
            {(field) => <SearchableSelect {...field} options={partners} placeholder="Search partners" emptyText="No recruitment partners" />}
          </FormField>
          <FormField label="From" name="periodStart" required state={state}>
            <Input type="date" />
          </FormField>
          <FormField label="To" name="periodEnd" required state={state}>
            <Input type="date" />
          </FormField>
          <SubmitButton pending={pending} pendingLabel="Calculating…" className="md:mb-[1.6rem]">
            Generate
          </SubmitButton>
        </div>
      </form>
      <div aria-live="polite">
        {result ? (
          <div className="space-y-2 rounded-lg border bg-surface-subtle p-4 text-sm">
            {result.settlements.length ? (
              <ul className="space-y-1">
                {result.settlements.map((s) => (
                  <li key={s.id}>
                    <a className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/commercial/settlements/${s.id}`}>
                      {s.code}
                    </a>{" "}
                    · <MoneyText amountMinor={s.amountMinor} currency={s.currency} /> · {s.linesAdded} new line{s.linesAdded === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No placement fees are payable for this period.</p>
            )}
            {result.skipped.length ? (
              <details>
                <summary className="cursor-pointer">{result.skipped.length} placements skipped</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={s.placementId}>
                      {s.placementCode}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SettlementLineForm({ settlementId }: { settlementId: string }) {
  const { state, pending, onSubmit, formKey } = useBillingForm(addSettlementLineAction, { resetOnSuccess: true });
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Add a line">
      <input type="hidden" name="settlementId" value={settlementId} />
      <FormErrorAlert state={state} fieldLabels={{ kind: "Type", description: "Description", amount: "Amount" }} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <FormField label="Type" name="kind" required state={state}>
          {(field) => <SimpleSelect {...field} options={OPTIONS.settlementLineKind} placeholder="Choose" />}
        </FormField>
        <FormField label="Description" name="description" required state={state}>
          <Input maxLength={300} />
        </FormField>
        <FormField label="Amount" name="amount" required state={state} hint="Deductions reduce the total.">
          <Input inputMode="decimal" maxLength={20} />
        </FormField>
      </div>
      <SubmitButton pending={pending} pendingLabel="Adding…" variant="outline">
        Add line
      </SubmitButton>
    </form>
  );
}

export function SettlementDraftForm({ settlementId, withholdingTax, notes, internalNotes }: { settlementId: string; withholdingTax: string; notes: string; internalNotes: string }) {
  const { state, pending, onSubmit } = useBillingForm(updateSettlementDraftAction);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Settlement details">
      <input type="hidden" name="settlementId" value={settlementId} />
      <FormErrorAlert state={state} fieldLabels={{ withholdingTax: "Tax deducted at source" }} />
      <FormField label="Tax deducted at source" name="withholdingTax" optional state={state}>
        <Input inputMode="decimal" maxLength={20} defaultValue={withholdingTax} />
      </FormField>
      <FormField label="Note to the partner" name="notes" optional state={state} hint="Visible to the partner.">
        <Textarea rows={2} maxLength={2000} defaultValue={notes} />
      </FormField>
      <FormField label="Internal notes" name="internalNotes" optional state={state} hint="Staff only. Never shown to the partner.">
        <Textarea rows={2} maxLength={2000} defaultValue={internalNotes} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="outline">
        Save
      </SubmitButton>
    </form>
  );
}

export function RemoveLineButton({ lineId, label }: { lineId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Remove ${label}`}>
          Remove
        </Button>
      }
      title="Remove this line?"
      confirmLabel="Remove"
      variant="destructive"
      onConfirm={async () => {
        const r = await removeSettlementLineAction({ lineId });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function SubmitSettlementButton({ settlementId }: { settlementId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await submitSettlementAction({ settlementId });
          if (r.ok) {
            toast.success(r.message ?? "Sent for approval");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      Submit for approval
    </Button>
  );
}

export function MarkPaidForm({ settlementId, today }: { settlementId: string; today: string }) {
  const { state, pending, onSubmit } = useBillingForm(markSettlementPaidAction);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Mark as paid">
      <input type="hidden" name="settlementId" value={settlementId} />
      <FormErrorAlert state={state} fieldLabels={{ paymentReference: "Payment reference", paidAt: "Paid on" }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Payment reference" name="paymentReference" required state={state} hint="Bank UTR of the payout.">
          <Input maxLength={100} autoComplete="off" />
        </FormField>
        <FormField label="Paid on" name="paidAt" required state={state}>
          <Input type="date" defaultValue={today} max={today} />
        </FormField>
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Mark as paid
      </SubmitButton>
    </form>
  );
}

export function CancelSettlementButton({ settlementId }: { settlementId: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Cancel settlement</Button>}
      title="Cancel this settlement?"
      description="Its placement fees become available for a new settlement."
      confirmLabel="Cancel settlement"
      cancelLabel="Keep"
      variant="destructive"
      onConfirm={async (fd) => {
        const r = await cancelSettlementAction(null, fd);
        if (r.ok) router.refresh();
        return r;
      }}
    >
      <input type="hidden" name="settlementId" value={settlementId} />
      <div className="space-y-1.5">
        <Label htmlFor="cancel-settlement-reason">Reason</Label>
        <Textarea id="cancel-settlement-reason" name="reason" rows={2} maxLength={500} required />
      </div>
    </ConfirmDialog>
  );
}

const OUTCOMES: SelectOption[] = [
  { value: "approved", label: "Stands as approved (to be paid)" },
  { value: "paid", label: "Already paid" },
  { value: "draft", label: "Back to draft for corrections" },
];

export function ResolveDisputeForm({ settlementId }: { settlementId: string }) {
  const { state, pending, onSubmit } = useBillingForm(resolveSettlementDisputeAction);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Resolve partner query">
      <input type="hidden" name="settlementId" value={settlementId} />
      <FormErrorAlert state={state} fieldLabels={{ outcome: "Outcome", note: "Answer to the partner" }} />
      <FormField label="Outcome" name="outcome" required state={state}>
        {(field) => <SimpleSelect {...field} options={OUTCOMES} placeholder="Choose" />}
      </FormField>
      <FormField label="Answer to the partner" name="note" required state={state}>
        <Textarea rows={3} maxLength={1000} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Resolve
      </SubmitButton>
    </form>
  );
}
