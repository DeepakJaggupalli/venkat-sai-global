"use client";

import { useRouter } from "next/navigation";

import { OPTIONS } from "@/components/billing/labels";
import { useBillingForm } from "@/components/billing/use-billing-form";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPlanAction, updatePlanAction } from "@/modules/commercial/actions";
import type { PlanView } from "@/modules/commercial/types";

const LABELS = { key: "Key", name: "Name", description: "Description", audience: "Audience", kind: "Kind", sortOrder: "Sort order", trialDays: "Trial days", highlights: "Highlights" };

/** Create a plan (key, audience and kind are fixed afterwards) or edit an existing one. */
export function PlanForm({ plan, canEdit }: { plan?: PlanView; canEdit: boolean }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useBillingForm<{ id: string } | undefined>(plan ? (updatePlanAction as never) : (createPlanAction as never), {
    refresh: Boolean(plan),
    onSuccess: (data) => {
      if (!plan && data?.id) router.push(`/admin/commercial/plans/${data.id}`);
    },
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label={plan ? "Plan details" : "New plan"}>
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <FormErrorAlert state={state} fieldLabels={LABELS} />
      <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Name" name="name" required state={state} hint="Shown to customers.">
            <Input defaultValue={plan?.name ?? ""} maxLength={120} />
          </FormField>
          {plan ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Key</p>
              <p className="rounded-md bg-surface-subtle px-3 py-2 font-mono text-sm">{plan.key}</p>
            </div>
          ) : (
            <FormField label="Key" name="key" required state={state} hint="Internal identifier, lowercase with underscores. Cannot be changed later.">
              <Input maxLength={64} autoComplete="off" className="font-mono" placeholder="employer_growth" />
            </FormField>
          )}
          {!plan ? (
            <>
              <FormField label="Audience" name="audience" required state={state}>
                {(field) => <SimpleSelect {...field} options={OPTIONS.audience} placeholder="Who can buy it" />}
              </FormField>
              <FormField label="Kind" name="kind" required state={state} hint="Add-ons stack on a base plan; credit packs are add-ons with a one-time price.">
                {(field) => (
                  <SimpleSelect
                    {...field}
                    defaultValue="base"
                    options={[
                      { value: "base", label: "Base plan" },
                      { value: "add_on", label: "Add-on / credit pack" },
                    ]}
                  />
                )}
              </FormField>
            </>
          ) : null}
          <FormField label="Trial days" name="trialDays" optional state={state} hint="0 or blank for no trial. A trial is offered once per organisation and plan.">
            <Input type="number" min={0} max={365} defaultValue={plan?.trialDays ?? ""} inputMode="numeric" />
          </FormField>
          <FormField label="Sort order" name="sortOrder" optional state={state} hint="Lower numbers are shown first.">
            <Input type="number" min={0} max={10000} defaultValue={plan?.sortOrder ?? ""} inputMode="numeric" />
          </FormField>
        </div>
        <FormField label="Description" name="description" optional state={state}>
          <Textarea defaultValue={plan?.description ?? ""} maxLength={2000} rows={3} />
        </FormField>
        <FormField label="Highlights" name="highlights" optional state={state} hint="Short selling points shown on the plan card (up to 12). Press Enter after each. Only state what the plan really includes.">
          {(field) => <TagInput {...field} name="highlights" defaultValue={plan?.highlights ?? []} maxTags={12} maxLength={160} placeholder="Add a highlight" />}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <CheckboxField name="isActive" label="Active" hint="Inactive plans cannot be bought." defaultChecked={plan?.isActive ?? false} />
          <CheckboxField name="isPublic" label="Public" hint="Shown in the portals' plan picker." defaultChecked={plan?.isPublic ?? false} />
          <CheckboxField name="contactSalesOnly" label="Talk to our team" hint="Show a contact button instead of prices." defaultChecked={plan?.contactSalesOnly ?? false} />
        </div>
      </fieldset>
      {canEdit ? (
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {plan ? "Save plan" : "Create plan"}
        </SubmitButton>
      ) : null}
    </form>
  );
}

export function CheckboxField({ name, label, hint, defaultChecked, id }: { name: string; label: string; hint?: string; defaultChecked?: boolean; id?: string }) {
  const fieldId = id ?? `cb-${name}`;
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox id={fieldId} name={name} defaultChecked={defaultChecked} />
      <div>
        <Label htmlFor={fieldId}>{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
