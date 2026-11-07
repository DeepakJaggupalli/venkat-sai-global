"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { OPTIONS } from "@/components/billing/labels";
import { editorLinesPayload, parseEditorLines, type EditorLine } from "@/components/billing/plan-utils";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { MoneyText } from "@/components/shared/money-text";
import { CurrencySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceTaxTreatment } from "@/db/schema/commercial";
import { saveDraftInvoiceAction } from "@/modules/commercial/actions";
import { placeOfSupplyLabel } from "@/modules/commercial/constants";
import { priceInvoice, type PricingResult } from "@/modules/commercial/pricing";
import { formatRate, summarizeTaxes, type TaxRateRecord, type TaxSeller } from "@/modules/commercial/tax";

import type { BuyerTaxProfile, PreviewTaxRate } from "../../_lib/queries";

export type InvoiceDraftDefaults = {
  id: string;
  organizationId: string | null;
  currency: string;
  lines: EditorLine[];
  notes: string | null;
  internalNotes: string | null;
  purchaseOrderReference: string | null;
  taxTreatment: string;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
};

type Props = {
  buyers: BuyerTaxProfile[];
  currencies: SelectOption[];
  seller: TaxSeller;
  rates: PreviewTaxRate[];
  exportZeroRated: boolean;
  defaultTaxCode: string;
  draft?: InvoiceDraftDefaults;
};

const EMPTY_LINE: EditorLine = { description: "", quantity: "1", unitAmount: "", discount: "", taxCode: "" };

/**
 * Manual invoice editor with a live tax preview computed by the same pure pricing engine the service uses
 * (src/modules/commercial/pricing.ts). The service re-prices with current rates when the invoice is issued.
 */
export function InvoiceEditor({ buyers, currencies, seller, rates, exportZeroRated, defaultTaxCode, draft }: Props) {
  const router = useRouter();
  const [buyerId, setBuyerId] = useState(draft?.organizationId ?? "");
  const buyer = buyers.find((b) => b.organizationId === buyerId) ?? null;
  const [currency, setCurrency] = useState(draft?.currency ?? "");
  const [treatment, setTreatment] = useState(draft?.taxTreatment ?? "auto");
  const [lines, setLines] = useState<EditorLine[]>(draft?.lines.length ? draft.lines : [{ ...EMPTY_LINE }]);
  const { state, pending, onSubmit } = useBillingForm<{ id: string }>(saveDraftInvoiceAction as never, {
    refresh: Boolean(draft),
    onSuccess: (data) => {
      if (!draft && data?.id) router.push(`/admin/commercial/invoices/${data.id}`);
    },
  });

  const records = useMemo<TaxRateRecord[]>(
    () => rates.map((r) => ({ ...r, effectiveFrom: new Date(r.effectiveFrom), effectiveUntil: r.effectiveUntil ? new Date(r.effectiveUntil) : null })),
    [rates],
  );
  const parsed = useMemo(() => parseEditorLines(lines, currency || null), [lines, currency]);
  const preview = useMemo<{ result: PricingResult | null; error: string | null }>(() => {
    if (!buyer || !currency || !parsed.lines.length) return { result: null, error: null };
    try {
      const result = priceInvoice(
        parsed.lines.map((l) => ({ ...l, taxCode: l.taxCode ?? defaultTaxCode })),
        {
          seller,
          buyer: { countryCode: buyer.countryCode, stateCode: buyer.stateCode, taxExempt: buyer.taxExempt },
          rates: records,
          at: new Date(),
          exportZeroRated,
          treatmentOverride: treatment === "auto" ? null : (treatment as InvoiceTaxTreatment),
        },
      );
      return { result, error: null };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : "The preview could not be calculated." };
    }
  }, [buyer, currency, parsed.lines, seller, records, exportZeroRated, treatment, defaultTaxCode]);

  const update = (index: number, patch: Partial<EditorLine>) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const lineErrors = (state && !state.ok && state.fieldErrors) || {};
  const taxSummary = preview.result ? summarizeTaxes(preview.result.lines) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label={draft ? "Edit draft invoice" : "New invoice"}>
      {draft ? <input type="hidden" name="id" value={draft.id} /> : null}
      <input type="hidden" name="lines:json" value={JSON.stringify(editorLinesPayload(lines))} />
      <FormErrorAlert state={state} fieldLabels={{ organizationId: "Buyer", currency: "Currency", lines: "Lines", servicePeriodEnd: "Service period end", dueDays: "Days until due" }} showSummary />

      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="Buyer" name="organizationId" required state={state}>
          {(field) => (
            <SearchableSelect
              {...field}
              options={buyers.map((b) => ({ value: b.organizationId, label: b.name, description: b.hasProfile ? undefined : "No billing details yet" }))}
              value={buyerId}
              onValueChange={(v) => {
                setBuyerId(v);
                const b = buyers.find((x) => x.organizationId === v);
                if (b?.currency && !currency) setCurrency(b.currency);
              }}
              placeholder="Search organisations"
            />
          )}
        </FormField>
        <FormField label="Currency" name="currency" required state={state}>
          {(field) => <CurrencySelect {...field} options={currencies} value={currency} onValueChange={setCurrency} placeholder="Choose" />}
        </FormField>
        <FormField label="Tax treatment" name="taxTreatment" state={state}>
          {(field) => <SimpleSelect {...field} options={OPTIONS.taxTreatment} value={treatment} onValueChange={setTreatment} />}
        </FormField>
      </div>
      {buyer && !buyer.hasProfile ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">This organisation has no billing details yet. Save the draft, then add them on the draft page before issuing.</p>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Lines</legend>
        {lineErrors.lines ? <p className="text-sm text-danger-strong">{lineErrors.lines.join(" ")}</p> : null}
        <ol className="space-y-3">
          {lines.map((line, i) => {
            const err = parsed.errors[i] ?? lineErrors[`lines.${i}.description`]?.[0] ?? lineErrors[`lines.${i}.unitAmount`]?.[0] ?? null;
            return (
              <li key={i} className="rounded-lg border bg-background p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_6rem_auto] sm:items-end">
                  <LineInput label="Description" id={`line-${i}-desc`} value={line.description} onChange={(v) => update(i, { description: v })} maxLength={300} />
                  <LineInput label="Qty" id={`line-${i}-qty`} value={line.quantity} onChange={(v) => update(i, { quantity: v })} inputMode="numeric" />
                  <LineInput label="Unit price" id={`line-${i}-unit`} value={line.unitAmount} onChange={(v) => update(i, { unitAmount: v })} inputMode="decimal" />
                  <LineInput label="Discount" id={`line-${i}-disc`} value={line.discount} onChange={(v) => update(i, { discount: v })} inputMode="decimal" />
                  <LineInput label="SAC / HSN" id={`line-${i}-code`} value={line.taxCode} onChange={(v) => update(i, { taxCode: v })} placeholder={defaultTaxCode} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                {err ? (
                  <p className="mt-2 text-sm text-danger-strong" role="alert">
                    Line {i + 1}: {err}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])} disabled={lines.length >= 100}>
          <Plus className="size-4" aria-hidden="true" /> Add line
        </Button>
      </fieldset>

      <section aria-labelledby="tax-preview-title" aria-live="polite" className="rounded-xl border bg-surface-subtle p-4 sm:p-5">
        <h3 id="tax-preview-title" className="font-heading text-base font-semibold">
          Tax preview
        </h3>
        {!buyer || !currency ? (
          <p className="mt-2 text-sm text-muted-foreground">Choose the buyer and currency to see the tax.</p>
        ) : preview.error ? (
          <p className="mt-2 text-sm text-danger-strong">{preview.error}</p>
        ) : preview.result ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted-foreground">
              {preview.result.determination.supply === "intra_state"
                ? "Same state: CGST + SGST."
                : preview.result.determination.supply === "inter_state"
                  ? "Different state: IGST."
                  : preview.result.determination.note ?? "No tax charged."}
              {preview.result.determination.placeOfSupply ? ` Place of supply: ${placeOfSupplyLabel(preview.result.determination.placeOfSupply)}.` : ""}
            </p>
            <dl className="space-y-1">
              <PreviewRow label="Subtotal" amount={preview.result.totals.subtotalMinor} currency={currency} />
              {preview.result.totals.discountMinor ? <PreviewRow label="Discount" amount={-preview.result.totals.discountMinor} currency={currency} /> : null}
              {taxSummary?.map((t) => <PreviewRow key={`${t.kind}-${t.rateBasisPoints}`} label={`${t.name} ${formatRate(t.rateBasisPoints)}`} amount={t.amountMinor} currency={currency} />)}
              <div className="flex justify-between border-t pt-2 font-medium">
                <dt>Total</dt>
                <dd className="font-heading text-lg tabular-nums">
                  <MoneyText amountMinor={preview.result.totals.totalMinor} currency={currency} />
                </dd>
              </div>
            </dl>
            {preview.result.problems.length ? (
              <ul className="list-disc space-y-1 rounded-lg bg-warning-soft py-2 pl-8 pr-3 text-warning-strong">
                {preview.result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">Preview only. Rates and the buyer&apos;s details are applied again when the invoice is issued.</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Add a line with a price to see the tax.</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <FormField label="Purchase order" name="purchaseOrderReference" optional state={state}>
          <Input defaultValue={draft?.purchaseOrderReference ?? ""} maxLength={100} />
        </FormField>
        <FormField label="Days until due" name="dueDays" optional state={state} hint="Blank = the default from settings.">
          <Input type="number" min={0} max={120} inputMode="numeric" />
        </FormField>
        <FormField label="Service period from" name="servicePeriodStart" optional state={state}>
          <Input type="date" defaultValue={draft?.servicePeriodStart ?? ""} />
        </FormField>
        <FormField label="Service period to" name="servicePeriodEnd" optional state={state}>
          <Input type="date" defaultValue={draft?.servicePeriodEnd ?? ""} />
        </FormField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Notes on the invoice" name="notes" optional state={state} hint="Printed for the buyer.">
          <Textarea defaultValue={draft?.notes ?? ""} rows={3} maxLength={2000} />
        </FormField>
        <FormField label="Internal notes" name="internalNotes" optional state={state} hint="Staff only. Never printed or shown to the buyer.">
          <Textarea defaultValue={draft?.internalNotes ?? ""} rows={3} maxLength={2000} />
        </FormField>
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {draft ? "Save draft" : "Save as draft"}
      </SubmitButton>
    </form>
  );
}

function LineInput({ label, id, value, onChange, ...rest }: { label: string; id: string; value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "id">) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

function PreviewRow({ label, amount, currency }: { label: string; amount: number; currency: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">
        <MoneyText amountMinor={amount} currency={currency} />
      </dd>
    </div>
  );
}
