"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { saveCouponAction, setCouponActiveAction } from "@/modules/commercial/actions";

import { CheckboxField } from "../../plans/_components/plan-form";

export type CouponDefaults = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  percentOff: number | null;
  amountOff: string | null;
  currency: string | null;
  duration: string;
  durationCycles: number | null;
  maxRedemptions: number | null;
  maxRedemptionsPerOrganization: number | null;
  validFrom: string | null;
  validUntil: string | null;
  planIds: string[];
  isActive: boolean;
  redeemedCount: number;
};

/** Create or edit a coupon. The discount is frozen by the service after the first redemption. */
export function CouponForm({ coupon, plans, currencies, canEdit }: { coupon?: CouponDefaults; plans: SelectOption[]; currencies: SelectOption[]; canEdit: boolean }) {
  const router = useRouter();
  const [type, setType] = useState(coupon?.discountType ?? "percent");
  const [duration, setDuration] = useState(coupon?.duration ?? "once");
  const { state, pending, onSubmit } = useBillingForm<{ id: string }>(saveCouponAction as never, {
    refresh: Boolean(coupon),
    onSuccess: (data) => {
      if (!coupon && data?.id) router.push(`/admin/commercial/coupons/${data.id}`);
    },
  });
  const frozen = Boolean(coupon && coupon.redeemedCount > 0);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label={coupon ? "Edit coupon" : "New coupon"}>
      {coupon ? <input type="hidden" name="id" value={coupon.id} /> : null}
      <FormErrorAlert state={state} fieldLabels={{ code: "Code", percentOff: "Percentage", amountOff: "Discount", currency: "Currency", durationCycles: "Billing cycles", validUntil: "Valid until" }} />
      {frozen ? <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">This coupon has been redeemed {coupon!.redeemedCount} times, so its discount can no longer change.</p> : null}
      <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Code" name="code" required state={state} hint="3–40 letters, digits, - or _. Customers type this.">
            <Input defaultValue={coupon?.code ?? ""} maxLength={40} className="font-mono uppercase" autoComplete="off" />
          </FormField>
          <FormField label="Description" name="description" optional state={state} hint="Internal.">
            <Input defaultValue={coupon?.description ?? ""} maxLength={500} />
          </FormField>
          <FormField label="Discount type" name="discountType" required state={state}>
            {(field) => <SimpleSelect {...field} options={OPTIONS.couponType} value={type} onValueChange={setType} />}
          </FormField>
          {type === "percent" ? (
            <FormField label="Percentage off" name="percentOff" required state={state}>
              <Input type="number" min={1} max={100} defaultValue={coupon?.percentOff ?? ""} inputMode="numeric" readOnly={frozen} />
            </FormField>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Amount off" name="amountOff" required state={state}>
                <Input inputMode="decimal" defaultValue={coupon?.amountOff ?? ""} maxLength={20} readOnly={frozen} />
              </FormField>
              <FormField label="Currency" name="currency" required state={state}>
                {(field) => <CurrencySelect {...field} options={currencies} defaultValue={coupon?.currency ?? undefined} placeholder="Choose" />}
              </FormField>
            </div>
          )}
          <FormField label="Applies to" name="duration" required state={state}>
            {(field) => <SimpleSelect {...field} options={OPTIONS.couponDuration} value={duration} onValueChange={setDuration} />}
          </FormField>
          {duration === "repeating" ? (
            <FormField label="Billing cycles" name="durationCycles" required state={state}>
              <Input type="number" min={1} max={120} defaultValue={coupon?.durationCycles ?? ""} inputMode="numeric" />
            </FormField>
          ) : null}
          <FormField label="Total redemptions" name="maxRedemptions" optional state={state} hint="Blank = no limit.">
            <Input type="number" min={1} defaultValue={coupon?.maxRedemptions ?? ""} inputMode="numeric" />
          </FormField>
          <FormField label="Redemptions per organisation" name="maxRedemptionsPerOrganization" optional state={state}>
            <Input type="number" min={1} max={1000} defaultValue={coupon?.maxRedemptionsPerOrganization ?? ""} inputMode="numeric" />
          </FormField>
          <FormField label="Valid from" name="validFrom" optional state={state}>
            <Input type="date" defaultValue={coupon?.validFrom ?? ""} />
          </FormField>
          <FormField label="Valid until" name="validUntil" optional state={state}>
            <Input type="date" defaultValue={coupon?.validUntil ?? ""} />
          </FormField>
        </div>
        <FormField label="Only for these plans" name="planIds" optional state={state} hint="Blank = every plan.">
          {(field) => <MultiCombobox {...field} name="planIds" options={plans} defaultValue={plans.filter((p) => coupon?.planIds.includes(p.value))} placeholder="All plans" />}
        </FormField>
        <CheckboxField name="isActive" label="Active" hint="Inactive coupons cannot be redeemed." defaultChecked={coupon?.isActive ?? true} />
      </fieldset>
      {canEdit ? (
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {coupon ? "Save coupon" : "Create coupon"}
        </SubmitButton>
      ) : null}
    </form>
  );
}

export function CouponActiveToggle({ couponId, isActive }: { couponId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`coupon-active-${couponId}`}
        checked={isActive}
        disabled={pending}
        onCheckedChange={(checked) =>
          start(async () => {
            const r = await setCouponActiveAction({ couponId, isActive: checked });
            if (r.ok) {
              toast.success(r.message ?? "Saved");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
      <Label htmlFor={`coupon-active-${couponId}`} className="sr-only">
        Active
      </Label>
    </div>
  );
}
