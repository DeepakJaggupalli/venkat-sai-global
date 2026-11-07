"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { INTERVAL_LABELS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { adjustCreditsAction, requestSubscriptionExceptionAction, startSubscriptionForStaffAction } from "@/modules/commercial/actions";
import type { PlanView } from "@/modules/commercial/types";

import { CheckboxField } from "../../plans/_components/plan-form";

/** Manual credit adjustment with a mandatory reason (credit keys only; balances never go below zero). */
export function AdjustCreditsForm({ organizationId, keys }: { organizationId: string; keys: SelectOption[] }) {
  const { state, pending, onSubmit, formKey } = useBillingForm(adjustCreditsAction, { resetOnSuccess: true });
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Adjust credits">
      <input type="hidden" name="organizationId" value={organizationId} />
      <FormErrorAlert state={state} fieldLabels={{ entitlementKey: "Credit", delta: "Change", note: "Reason", expiresAt: "Expires on" }} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Credit" name="entitlementKey" required state={state}>
          {(field) => <SimpleSelect {...field} options={keys} placeholder="Choose" />}
        </FormField>
        <FormField label="Change" name="delta" required state={state} hint="Positive adds, negative removes.">
          <Input type="number" inputMode="numeric" min={-1000000} max={1000000} />
        </FormField>
        <FormField label="Expires on" name="expiresAt" optional state={state}>
          <Input type="date" />
        </FormField>
      </div>
      <FormField label="Reason" name="note" required state={state} hint="Recorded in the ledger and audit log. Staff only.">
        <Textarea rows={2} maxLength={500} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="outline">
        Adjust credits
      </SubmitButton>
    </form>
  );
}

const EXCEPTION_KINDS: SelectOption[] = [
  { value: "extend_period", label: "Extend the current period" },
  { value: "extend_trial", label: "Extend the trial" },
  { value: "reactivate", label: "Reactivate an ended subscription" },
];

/** Extend / reactivate: goes to the approval inbox; applied when approved. */
export function SubscriptionExceptionForm({ subscriptionId }: { subscriptionId: string }) {
  const { state, pending, onSubmit, formKey } = useBillingForm(requestSubscriptionExceptionAction, { resetOnSuccess: true });
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Request an extension">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <FormErrorAlert state={state} fieldLabels={{ kind: "Change", days: "Days", reason: "Reason" }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Change" name="kind" required state={state}>
          {(field) => <SimpleSelect {...field} options={EXCEPTION_KINDS} placeholder="Choose" />}
        </FormField>
        <FormField label="Days" name="days" required state={state}>
          <Input type="number" min={1} max={365} inputMode="numeric" />
        </FormField>
      </div>
      <FormField label="Reason" name="reason" required state={state} hint="At least 10 characters. A second person approves it in the approvals inbox.">
        <Textarea rows={2} maxLength={1000} />
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Sending…" variant="outline">
        Send for approval
      </SubmitButton>
    </form>
  );
}

/** Staff create a subscription for an organisation (also for plans agreed with the team, without a price). */
export function StartSubscriptionForm({ organizations, plans }: { organizations: SelectOption[]; plans: PlanView[] }) {
  const router = useRouter();
  const [planId, setPlanId] = useState("");
  const { state, pending, onSubmit } = useBillingForm<{ subscriptionId: string; invoiceId: string | null }>(startSubscriptionForStaffAction as never, {
    refresh: false,
    onSuccess: (data) => {
      if (data?.subscriptionId) router.push(`/admin/commercial/subscriptions/${data.subscriptionId}`);
    },
  });
  const plan = plans.find((p) => p.id === planId);
  const priceOptions = useMemo(
    () => (plan?.prices ?? []).filter((p) => p.isActive && p.interval !== "one_time").map((p) => ({ value: p.id, label: `${formatMoney(p.amountMinor, p.currency)} · ${INTERVAL_LABELS[p.interval]}` })),
    [plan],
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="New subscription">
      <FormErrorAlert state={state} fieldLabels={{ organizationId: "Organisation", planId: "Plan", planPriceId: "Price", couponCode: "Coupon", notes: "Notes" }} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Organisation" name="organizationId" required state={state}>
          {(field) => <SearchableSelect {...field} options={organizations} placeholder="Search organisations" />}
        </FormField>
        <FormField label="Plan" name="planId" required state={state}>
          {(field) => (
            <SimpleSelect {...field} options={plans.map((p) => ({ value: p.id, label: `${p.name}${p.isActive ? "" : " (inactive)"}` }))} value={planId} onValueChange={setPlanId} placeholder="Choose a plan" />
          )}
        </FormField>
        <FormField label="Price" name="planPriceId" optional state={state} hint="Leave blank for a contract arranged with the team (no invoice, no renewal).">
          {(field) => <SimpleSelect {...field} key={planId} options={priceOptions} allowClear clearLabel="No price (contract)" placeholder="No price (contract)" />}
        </FormField>
        <FormField label="Coupon code" name="couponCode" optional state={state}>
          <Input maxLength={40} className="uppercase" autoComplete="off" />
        </FormField>
      </div>
      <FormField label="Notes" name="notes" optional state={state} hint="Internal. Never shown to the organisation.">
        <Textarea rows={2} maxLength={1000} />
      </FormField>
      <CheckboxField name="autoRenew" label="Renew automatically" hint="Renewal invoices are issued 7 days before the period ends." defaultChecked />
      <SubmitButton pending={pending} pendingLabel="Creating…">
        Create subscription
      </SubmitButton>
    </form>
  );
}
