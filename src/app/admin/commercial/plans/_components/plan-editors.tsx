"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { addPlanPriceAction, deactivatePlanPriceAction, removePlanFeatureAction, setDefaultPlanAction, setPlanFeatureAction } from "@/modules/commercial/actions";

import { CheckboxField } from "./plan-form";

/** Add a price in one currency and interval. */
export function PlanPriceForm({ planId, currencies, isAddOn }: { planId: string; currencies: SelectOption[]; isAddOn: boolean }) {
  const { state, pending, onSubmit, formKey } = useBillingForm(addPlanPriceAction, { resetOnSuccess: true });
  const intervals = isAddOn ? OPTIONS.interval : OPTIONS.interval.filter((o) => o.value !== "one_time");
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Add a price">
      <input type="hidden" name="planId" value={planId} />
      <FormErrorAlert state={state} fieldLabels={{ currency: "Currency", interval: "Interval", amount: "Price" }} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Currency" name="currency" required state={state}>
          {(field) => <CurrencySelect {...field} options={currencies} placeholder="Choose" />}
        </FormField>
        <FormField label="Interval" name="interval" required state={state} hint={isAddOn ? "One-time = credit pack." : undefined}>
          {(field) => <SimpleSelect {...field} options={intervals} placeholder="Choose" />}
        </FormField>
        <FormField label="Price" name="amount" required state={state} hint="For example 4999 or 4999.50">
          <Input inputMode="decimal" maxLength={20} />
        </FormField>
      </div>
      <CheckboxField name="taxInclusive" id={`tax-incl-${planId}`} label="Price includes tax" hint="Otherwise tax is added on the invoice." />
      <SubmitButton pending={pending} pendingLabel="Adding…" variant="outline">
        Add price
      </SubmitButton>
    </form>
  );
}

/** Set (upsert) the limit for one entitlement key. */
export function PlanFeatureForm({ planId, keys }: { planId: string; keys: SelectOption[] }) {
  const { state, pending, onSubmit, formKey } = useBillingForm(setPlanFeatureAction, { resetOnSuccess: true });
  const [unlimited, setUnlimited] = useState(false);
  const [period, setPeriod] = useState("none");
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Set a limit">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="unlimited" value={unlimited ? "on" : ""} />
      <FormErrorAlert state={state} fieldLabels={{ entitlementKey: "Feature", limitValue: "Limit", period: "Period", resetPolicy: "Unused allowance" }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Feature" name="entitlementKey" required state={state} hint="Setting a feature that already has a limit replaces it.">
          {(field) => <SimpleSelect {...field} options={keys} placeholder="Choose a feature" />}
        </FormField>
        <div className="flex items-center gap-2 pt-7">
          <Switch id={`unlimited-${planId}`} checked={unlimited} onCheckedChange={setUnlimited} />
          <Label htmlFor={`unlimited-${planId}`}>Unlimited</Label>
        </div>
        {!unlimited ? (
          <FormField label="Limit" name="limitValue" required state={state}>
            <Input type="number" min={0} inputMode="numeric" />
          </FormField>
        ) : null}
        <FormField label="Period" name="period" required state={state} hint="Standing = at the same time; per month/year = created in the period (credits are granted each period).">
          {(field) => <SimpleSelect {...field} options={OPTIONS.period} value={period} onValueChange={setPeriod} />}
        </FormField>
        {period !== "none" ? (
          <FormField label="Unused allowance" name="resetPolicy" required state={state}>
            {(field) => <SimpleSelect {...field} options={OPTIONS.reset.filter((o) => o.value !== "none")} placeholder="Choose" />}
          </FormField>
        ) : (
          <input type="hidden" name="resetPolicy" value="none" />
        )}
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="outline">
        Save limit
      </SubmitButton>
    </form>
  );
}

export function DeactivatePriceButton({ priceId, label }: { priceId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Deactivate ${label}`}>
          Deactivate
        </Button>
      }
      title="Deactivate this price?"
      description="New purchases can no longer use it. Existing subscriptions keep their price until they change plan."
      confirmLabel="Deactivate"
      variant="destructive"
      onConfirm={async () => {
        const r = await deactivatePlanPriceAction({ priceId });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function RemoveFeatureButton({ planId, entitlementKey, label }: { planId: string; entitlementKey: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Remove the ${label} limit`}>
          Remove
        </Button>
      }
      title={`Remove the ${label} limit?`}
      description="Organisations on this plan will no longer have this feature included."
      confirmLabel="Remove"
      variant="destructive"
      onConfirm={async () => {
        const r = await removePlanFeatureAction({ planId, entitlementKey });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function DefaultPlanToggle({ planId, isDefault, disabled }: { planId: string; isDefault: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={`default-${planId}`}
        checked={isDefault}
        disabled={disabled || pending}
        onCheckedChange={(checked) =>
          start(async () => {
            const r = await setDefaultPlanAction({ planId, isDefault: checked });
            if (r.ok) {
              toast.success(r.message ?? "Saved");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
      <div>
        <Label htmlFor={`default-${planId}`}>Default plan for this audience</Label>
        <p className="text-xs text-muted-foreground">Organisations without a paid plan get this plan&apos;s limits. One per audience; base plans only.</p>
      </div>
    </div>
  );
}
