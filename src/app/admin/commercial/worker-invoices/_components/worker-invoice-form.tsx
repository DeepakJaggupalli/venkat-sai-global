"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { useBillingForm } from "@/components/billing/use-billing-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { CurrencySelect } from "@/components/shared/selects";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { commonWorkerAmount, subtotalMinor, WORKER_STATUS_LABELS, type InvoiceableWorker } from "@/modules/commercial/worker-invoices-rules";

import { saveWorkerInvoiceAction } from "../actions";

const STATUS_TONE: Partial<Record<CvSubmissionStatus, "success" | "brand" | "neutral">> = { selected: "success", medical: "brand", visa: "brand", ticket: "brand", departed: "success" };

type Ticked = { worker: InvoiceableWorker; amount: string; touched: boolean };

export type WorkerInvoiceFormProps = {
  basePath: string;
  organization: { id: string; name: string };
  /** The draft being edited (null for a new invoice). */
  draftId: string | null;
  /** Draft currency, else the organisation's billing currency; null = staff must choose. */
  currency: string | null;
  currencies: SelectOption[];
  /** Search results for the current filters. */
  workers: InvoiceableWorker[];
  totalMatches: number;
  /** Ticked when the page opens (draft lines, or ?cv=). */
  initial: { worker: InvoiceableWorker; amount: string }[];
  notes: string | null;
  /** Why the invoice cannot be issued yet (billing details, tax rates); a draft can still be saved. */
  issueBlocked: string | null;
};

/**
 * Tick the workers supplied to the organisation, enter the amount once (it fills every worker; change a line when one
 * is different), choose the currency, then issue or save a draft. The service re-checks everything.
 */
export function WorkerInvoiceForm({ basePath, organization, draftId, currency: initialCurrency, currencies, workers, totalMatches, initial, notes, issueBlocked }: WorkerInvoiceFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const issueRef = useRef<HTMLButtonElement>(null);
  const [common, setCommon] = useState(() => commonWorkerAmount(initial.map((t) => t.amount)));
  // A draft line whose amount differs from the common amount was set on its own: the common field never overwrites it.
  const [ticked, setTicked] = useState<Ticked[]>(() => {
    const shared = commonWorkerAmount(initial.map((t) => t.amount));
    return initial.map((t) => ({ ...t, touched: t.amount.trim() !== shared }));
  });
  const [currency, setCurrency] = useState(initialCurrency ?? "");
  const [intent, setIntent] = useState<"issue" | "draft">(issueBlocked ? "draft" : "issue");
  const { state, pending, onSubmit } = useBillingForm<{ id: string; issued: boolean; code: string | null; issueProblem: string | null }>(saveWorkerInvoiceAction, {
    refresh: Boolean(draftId),
    onSuccess: (data) => {
      if (data?.id && data.id !== draftId) router.push(`${basePath}/${data.id}`);
    },
  });

  // Latest facts (already invoiced, stage) for ticked workers that are in the current results.
  const fresh = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const tickedIds = useMemo(() => new Set(ticked.map((t) => t.worker.id)), [ticked]);
  const errors = (state && !state.ok && state.fieldErrors) || {};
  const total = subtotalMinor(
    ticked.map((t) => t.amount),
    currency || null,
  );

  function toggle(worker: InvoiceableWorker, on: boolean) {
    setTicked((prev) => {
      if (!on) return prev.filter((t) => t.worker.id !== worker.id);
      if (prev.some((t) => t.worker.id === worker.id)) return prev;
      return [...prev, { worker, amount: common, touched: false }];
    });
  }

  function setCommonAmount(value: string) {
    setCommon(value);
    setTicked((prev) => prev.map((t) => (t.touched ? t : { ...t, amount: value })));
  }

  function setLineAmount(id: string, value: string) {
    setTicked((prev) => prev.map((t) => (t.worker.id === id ? { ...t, amount: value, touched: true } : t)));
  }

  const payload = JSON.stringify(ticked.map((t) => ({ submissionId: t.worker.id, amount: t.amount.trim() })));

  // The confirmation dialog has its own <form> in a portal, and React bubbles its submit event through the component
  // tree to this form: without this check, "Issue invoice" sent a second request (a draft save) right after issuing,
  // which failed and showed an error for an invoice that had been issued. Only this form's own submissions count.
  function submitOwn(event: FormEvent<HTMLFormElement>) {
    if (event.target !== event.currentTarget) return;
    onSubmit(event);
  }

  return (
    <form ref={formRef} onSubmit={submitOwn} noValidate className="space-y-8" aria-label={draftId ? "Edit worker invoice" : "New worker invoice"}>
      {draftId ? <input type="hidden" name="id" value={draftId} /> : null}
      <input type="hidden" name="organizationId" value={organization.id} />
      <input type="hidden" name="lines:json" value={payload} />
      <FormErrorAlert state={state} fieldLabels={{ organizationId: "Who pays", currency: "Currency", lines: "Workers" }} />

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-foreground">Tick the workers</legend>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {totalMatches === 0
            ? "No workers match. Only workers who are selected, at medical, visa or ticket stage, or departed can be invoiced."
            : totalMatches > workers.length
              ? `Showing ${workers.length} of ${totalMatches} workers. Search to find others.`
              : `${totalMatches} ${totalMatches === 1 ? "worker" : "workers"}.`}
        </p>
        {workers.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {workers.map((w) => {
              const checked = tickedIds.has(w.id);
              const blocked = Boolean(w.alreadyInvoiced) || !w.invoiceable;
              const id = `worker-${w.id}`;
              return (
                <li key={w.id}>
                  <label
                    htmlFor={id}
                    className={cn(
                      "flex min-h-14 items-start gap-3 px-4 py-3 transition-colors",
                      blocked && !checked ? "cursor-not-allowed bg-surface-subtle" : "cursor-pointer hover:bg-surface-subtle",
                      checked && "bg-teal-soft/50",
                    )}
                  >
                    <Checkbox id={id} checked={checked} disabled={blocked && !checked} onCheckedChange={(v) => toggle(w, v === true)} className="mt-0.5 size-5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium break-words text-foreground">{w.name}</span>
                        <StatusBadge tone={STATUS_TONE[w.status] ?? "neutral"} size="sm">
                          {WORKER_STATUS_LABELS[w.status]}
                        </StatusBadge>
                      </span>
                      <span className="block text-sm break-words text-muted-foreground">
                        {w.tradeLabel} · {w.code}
                        {w.passportLast4 ? ` · Passport …${w.passportLast4}` : ""}
                      </span>
                      {w.requirementTitle ? <span className="block text-xs break-words text-muted-foreground">Applied for {w.requirementTitle}</span> : null}
                      {w.placedOrganizationId === organization.id ? (
                        <span className="block text-xs font-medium text-success-strong">Supplied to {organization.name}</span>
                      ) : w.placedOrganizationName ? (
                        <span className="block text-xs text-muted-foreground">Supplied to {w.placedOrganizationName}</span>
                      ) : null}
                      {w.alreadyInvoiced ? <span className="block text-xs font-medium text-warning-strong">Already on {w.alreadyInvoiced.code ?? "a draft invoice"} for {organization.name}</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Amount per worker" name="commonAmount" hint="Fills every ticked worker. A line you change below keeps its own amount.">
          <Input value={common} onChange={(e) => setCommonAmount(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" className="h-11 tabular-nums" />
        </FormField>
        <FormField label="Currency" name="currency" required state={state} hint={initialCurrency ? "From the billing details. Change it if this invoice is in another currency." : "Choose the currency you will bill in."}>
          {(field) => <CurrencySelect {...field} options={currencies} value={currency} onValueChange={setCurrency} placeholder="Choose currency…" className="h-11" />}
        </FormField>
      </div>

      <section aria-labelledby="ticked-heading" className="space-y-3">
        <h3 id="ticked-heading" className="text-base font-semibold text-foreground">
          On this invoice ({ticked.length})
        </h3>
        {errors.lines ? (
          <p className="text-sm text-danger-strong" role="alert">
            {errors.lines.join(" ")}
          </p>
        ) : null}
        {ticked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Tick workers in the list above.</p>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {ticked.map((t, index) => {
              const latest = fresh.get(t.worker.id) ?? t.worker;
              const lineError = errors[`lines.${index}.amount`]?.[0] ?? errors[`lines.${index}.submissionId`]?.[0] ?? null;
              const inputId = `amount-${t.worker.id}`;
              const problem = latest.alreadyInvoiced
                ? `Already on ${latest.alreadyInvoiced.code ?? "a draft invoice"}`
                : !latest.code
                  ? "This worker record is no longer available: untick it"
                  : !latest.invoiceable
                    ? `Now at ${WORKER_STATUS_LABELS[latest.status]}: untick or change the stage first`
                    : null;
              return (
                <li key={t.worker.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words text-foreground">
                      {index + 1}. {t.worker.name}
                    </p>
                    <p className="text-sm break-words text-muted-foreground">{t.worker.tradeLabel}</p>
                    {problem ? <p className="text-xs font-medium text-warning-strong">{problem}</p> : null}
                    {lineError ? (
                      <p className="text-sm text-danger-strong" role="alert">
                        {lineError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor={inputId} className="sr-only">
                      Amount for {t.worker.name}
                    </label>
                    <Input
                      id={inputId}
                      value={t.amount}
                      onChange={(e) => setLineAmount(t.worker.id, e.target.value)}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      aria-invalid={lineError ? true : undefined}
                      className="h-11 w-full text-right tabular-nums sm:w-40"
                    />
                    <span className="w-10 shrink-0 text-sm text-muted-foreground" translate="no">
                      {currency}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Remove ${t.worker.name}`} onClick={() => toggle(t.worker, false)}>
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <FormField label="Note on the invoice" name="notes" optional state={state} hint="Printed on the invoice, for example the project, site or visa batch.">
        <Textarea defaultValue={notes ?? ""} rows={3} maxLength={2000} />
      </FormField>

      <div className="space-y-4 rounded-2xl border border-border bg-surface-subtle p-4 sm:p-5">
        <dl className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-sm text-muted-foreground">
            {ticked.length} {ticked.length === 1 ? "worker" : "workers"} · subtotal before tax
          </dt>
          <dd className="font-heading text-xl font-semibold text-foreground tabular-nums">
            {!ticked.length ? "—" : !currency ? "Choose the currency" : total !== null ? formatMoney(total, currency) : "Enter an amount for every worker"}
          </dd>
        </dl>
        <p className="text-sm text-muted-foreground">Tax (GST) is worked out from the billing details when the invoice is issued. Workers are never charged.</p>
        {issueBlocked ? (
          <p className="text-sm font-medium text-warning-strong" role="note">
            Cannot issue yet: {issueBlocked} Save a draft for now.
          </p>
        ) : null}
        {/* Enter in a field saves a draft (the first submit button); issuing always asks first. */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {issueBlocked ? null : (
            <ConfirmDialog
              trigger={
                <Button type="button" disabled={pending} className="h-12 rounded-full px-6 text-base">
                  {pending && intent === "issue" ? "Issuing…" : "Issue invoice"}
                </Button>
              }
              title={`Issue this invoice to ${organization.name}?`}
              description={`${ticked.length} ${ticked.length === 1 ? "worker" : "workers"}${total !== null && currency ? `, ${formatMoney(total, currency)} before tax` : ""}. It gets the next GST invoice number and ${organization.name} is notified. An issued invoice cannot be edited, only voided.`}
              confirmLabel="Issue invoice"
              successMessage={false}
              onConfirm={() => {
                setIntent("issue");
                formRef.current?.requestSubmit(issueRef.current ?? undefined);
              }}
            />
          )}
          <SubmitButton
            name="intent"
            value="draft"
            variant={issueBlocked ? "default" : "outline"}
            pending={pending && intent === "draft"}
            disabled={pending && intent !== "draft"}
            onClick={() => setIntent("draft")}
            className="h-12 rounded-full px-6 text-base"
          >
            Save draft
          </SubmitButton>
          <button ref={issueRef} type="submit" name="intent" value="issue" hidden tabIndex={-1} aria-hidden="true" />
        </div>
      </div>
    </form>
  );
}
