"use client";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { openDisputeAction } from "@/modules/commercial/actions";

import type { BillingPortal } from "./portal-config";
import { useBillingForm } from "./use-billing-form";

/** Raise a billing query (dispute) about one of the organisation's invoices. */
export function BillingQueryForm({ portal, invoices }: { portal: BillingPortal; invoices: SelectOption[] }) {
  const { state, pending, onSubmit, formKey } = useBillingForm(openDisputeAction, { resetOnSuccess: true });
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Raise a billing query">
      <input type="hidden" name="portal" value={portal} />
      <FormErrorAlert state={state} fieldLabels={{ invoiceId: "Invoice", amount: "Amount", reason: "What is wrong" }} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Invoice" name="invoiceId" required state={state}>
          {(field) => <SimpleSelect {...field} options={invoices} placeholder="Choose an invoice" />}
        </FormField>
        <FormField label="Amount in question" name="amount" optional state={state} hint="Leave blank if the whole invoice is in question.">
          <Input inputMode="decimal" maxLength={20} />
        </FormField>
      </div>
      <FormField label="What is wrong" name="reason" required state={state} hint="At least 10 characters. Our finance team replies by email.">
        <Textarea rows={3} maxLength={2000} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Sending…" variant="outline">
        Send query
      </SubmitButton>
      <p className="sr-only" aria-live="polite">
        {state?.ok ? state.message : ""}
      </p>
    </form>
  );
}
