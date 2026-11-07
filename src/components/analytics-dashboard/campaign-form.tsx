"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCampaignAction, saveCampaignAction } from "@/modules/analytics/actions";

export type CampaignFormValues = {
  id: string;
  utmCampaign: string;
  name: string;
  channel: string;
  startsOn: string | null;
  endsOn: string | null;
  /** Major units, formatted for the input ("1250.00"). */
  cost: string;
  currency: string | null;
  notes: string | null;
};

const FIELD_LABELS = {
  utmCampaign: "utm_campaign value",
  name: "Name",
  channel: "Channel",
  startsOn: "Start date",
  endsOn: "End date",
  cost: "Ad cost",
  currency: "Currency",
  notes: "Notes",
};

/**
 * Add or edit a campaign: the utm_campaign key, a readable name, its channel and the manual ad cost used for
 * cost per acquisition. Cost is typed in major units of the chosen currency (never assumed).
 */
export function CampaignDialog({
  campaign,
  channelOptions,
  currencyOptions,
  suggestedKey,
}: {
  campaign?: CampaignFormValues;
  channelOptions: SelectOption[];
  currencyOptions: SelectOption[];
  /** Prefill for an untracked utm_campaign seen in traffic. */
  suggestedKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(saveCampaignAction, null);
  useActionToast(state, { onSuccess: () => setOpen(false) });
  const editing = Boolean(campaign);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title={editing ? `Edit campaign ${campaign?.name}` : "Add a campaign"}
      description="Match the utm_campaign value used in your links. Costs stay internal and are used for cost per acquisition."
      trigger={
        editing ? (
          <Button variant="ghost" size="sm" aria-label={`Edit ${campaign?.name}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button variant={suggestedKey ? "outline" : "default"} size={suggestedKey ? "sm" : "default"}>
            <Plus aria-hidden="true" />
            {suggestedKey ? "Add details" : "Add campaign"}
          </Button>
        )
      }
    >
      <form action={formAction} className="space-y-4" noValidate>
        <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
        {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="utm_campaign value" name="utmCampaign" required state={state} hint="Lower case, exactly as in the link">
            <Input defaultValue={campaign?.utmCampaign ?? suggestedKey ?? ""} autoComplete="off" maxLength={200} />
          </FormField>
          <FormField label="Name" name="name" required state={state}>
            <Input defaultValue={campaign?.name ?? ""} maxLength={200} />
          </FormField>
          <FormField label="Channel" name="channel" required state={state}>
            {(field) => <SimpleSelect {...field} name="channel" options={channelOptions} defaultValue={campaign?.channel ?? undefined} placeholder="Choose a channel" />}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start date" name="startsOn" optional state={state}>
              <Input type="date" defaultValue={campaign?.startsOn ?? ""} />
            </FormField>
            <FormField label="End date" name="endsOn" optional state={state}>
              <Input type="date" defaultValue={campaign?.endsOn ?? ""} />
            </FormField>
          </div>
          <FormField label="Ad cost" name="cost" optional state={state} hint="Total spend for the campaign, in the currency below">
            <Input type="number" inputMode="decimal" min={0} step="any" defaultValue={campaign?.cost ?? ""} />
          </FormField>
          <FormField label="Currency" name="currency" optional state={state} hint="Required when a cost is entered">
            {(field) => (
              <CurrencySelect {...field} name="currency" options={currencyOptions} defaultValue={campaign?.currency ?? undefined} allowClear clearLabel="No currency" />
            )}
          </FormField>
        </div>
        <FormField label="Notes" name="notes" optional state={state}>
          <Textarea defaultValue={campaign?.notes ?? ""} rows={3} maxLength={2000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pendingLabel="Saving…">{editing ? "Save campaign" : "Add campaign"}</SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

export function DeleteCampaignButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Delete ${name}`}>
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      }
      title={`Delete campaign ${name}?`}
      description="The name, channel and cost are removed. Visits tagged with this utm_campaign stay in the reports without a cost."
      confirmLabel="Delete campaign"
      variant="destructive"
      onConfirm={() => deleteCampaignAction({ id })}
    />
  );
}
