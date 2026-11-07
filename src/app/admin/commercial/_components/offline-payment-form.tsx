"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FileUpload } from "@/components/files";
import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { CurrencySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordOfflinePaymentAction } from "@/modules/commercial/actions";
import { OFFLINE_PAYMENT_PROVIDERS } from "@/modules/commercial/schemas";

type InvoiceChoice = { value: string; label: string; currency: string; outstanding: string };

type Props =
  | { mode: "invoice"; invoice: { id: string; currency: string; outstanding: string }; today: string }
  | { mode: "any"; invoices: InvoiceChoice[]; organizations: SelectOption[]; currencies: SelectOption[]; today: string };

const PROVIDERS = OPTIONS.provider.filter((o) => (OFFLINE_PAYMENT_PROVIDERS as readonly string[]).includes(o.value));

/**
 * Record a payment received offline (bank transfer UTR, UPI reference, cheque number). Either against an invoice,
 * or as an advance payment for an organisation that is allocated to an invoice later.
 */
export function OfflinePaymentForm(props: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState("bank_transfer");
  const [target, setTarget] = useState<"invoice" | "advance">("invoice");
  const [invoiceId, setInvoiceId] = useState(props.mode === "invoice" ? props.invoice.id : "");
  const choice = props.mode === "any" ? props.invoices.find((i) => i.value === invoiceId) : null;
  const [currency, setCurrency] = useState(props.mode === "invoice" ? props.invoice.currency : "");
  const { state, pending, onSubmit, formKey } = useBillingForm<{ id: string }>(recordOfflinePaymentAction as never, {
    resetOnSuccess: props.mode === "invoice",
    onSuccess: () => {
      if (props.mode === "any") router.push("/admin/commercial/payments");
    },
  });
  const effectiveCurrency = props.mode === "invoice" ? props.invoice.currency : (choice?.currency ?? currency);
  const outstanding = props.mode === "invoice" ? props.invoice.outstanding : choice?.outstanding;

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Record a payment">
      <FormErrorAlert state={state} fieldLabels={{ invoiceId: "Invoice", organizationId: "Organisation", amount: "Amount", currency: "Currency", externalReference: "Reference", receivedAt: "Received on" }} />
      {props.mode === "invoice" ? <input type="hidden" name="invoiceId" value={props.invoice.id} /> : null}
      {effectiveCurrency && (props.mode === "invoice" || target === "invoice") ? <input type="hidden" name="currency" value={effectiveCurrency} /> : null}

      {props.mode === "any" ? (
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Payment for" className="flex flex-wrap gap-4 text-sm">
            {(["invoice", "advance"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="radio" name="_target" value={t} checked={target === t} onChange={() => setTarget(t)} className="size-4 accent-[var(--color-teal)]" />
                {t === "invoice" ? "An open invoice" : "Advance payment (allocate later)"}
              </label>
            ))}
          </div>
          {target === "invoice" ? (
            <FormField label="Invoice" name="invoiceId" required state={state}>
              {(field) => <SearchableSelect {...field} options={props.invoices} value={invoiceId} onValueChange={setInvoiceId} placeholder="Search open invoices" emptyText="No open invoices" />}
            </FormField>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Organisation" name="organizationId" required state={state}>
                {(field) => <SearchableSelect {...field} options={props.organizations} placeholder="Search organisations" />}
              </FormField>
              <FormField label="Currency" name="currency" required state={state}>
                {(field) => <CurrencySelect {...field} options={props.currencies} value={currency} onValueChange={setCurrency} placeholder="Choose" />}
              </FormField>
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="Received by" name="provider" required state={state}>
          {(field) => <SimpleSelect {...field} options={PROVIDERS} value={provider} onValueChange={setProvider} />}
        </FormField>
        <FormField label={`Amount${effectiveCurrency ? ` (${effectiveCurrency})` : ""}`} name="amount" required state={state} hint={outstanding ? `Balance due: ${outstanding}` : undefined}>
          <Input inputMode="decimal" maxLength={20} defaultValue={outstanding ?? ""} />
        </FormField>
        <FormField label="Received on" name="receivedAt" required state={state}>
          <Input type="date" defaultValue={props.today} max={props.today} />
        </FormField>
        <FormField
          label={provider === "cheque" ? "Cheque number" : provider === "upi_manual" ? "UPI transaction reference" : provider === "bank_transfer" ? "UTR number" : "Reference"}
          name="externalReference"
          required={provider !== "manual"}
          optional={provider === "manual"}
          state={state}
        >
          <Input maxLength={100} autoComplete="off" />
        </FormField>
        <FormField label="Method" name="method" optional state={state}>
          {(field) => <SimpleSelect {...field} options={OPTIONS.method} allowClear placeholder="Not specified" />}
        </FormField>
      </div>
      <FileUpload purpose="invoice" name="proofFileId" label="Proof of payment (optional)" description="PDF of the bank advice or receipt." />
      <FormField label="Notes" name="notes" optional state={state} hint="Staff only.">
        <Textarea rows={2} maxLength={1000} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Recording…">
        Record payment
      </SubmitButton>
    </form>
  );
}
