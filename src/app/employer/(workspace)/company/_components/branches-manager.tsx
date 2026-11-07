"use client";

import { MapPin, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useEmployerForm } from "@/components/employer/use-form-action";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { CountrySelect } from "@/components/shared/selects";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveBranchAction, setBranchActiveAction } from "../actions";

export type BranchItem = {
  id: string;
  name: string;
  countryCode: string;
  stateRegion: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  timezone: string | null;
  isHeadquarters: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
};

function BranchForm({ branch, countries, onDone }: { branch?: BranchItem; countries: SelectOption[]; onDone: () => void }) {
  const { state, pending, onSubmit } = useEmployerForm(saveBranchAction);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const d = branch;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {d ? <input type="hidden" name="branchId" value={d.id} /> : null}
      <FormErrorAlert state={state} fieldLabels={{ name: "Branch name", countryCode: "Country", timezone: "Time zone", contactEmail: "Contact email", contactPhone: "Contact phone" }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Branch name" name="name" required state={state} className="sm:col-span-2">
          <Input defaultValue={d?.name} maxLength={120} />
        </FormField>
        <FormField label="Country" name="countryCode" required state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={d?.countryCode} placeholder="Choose a country" />}
        </FormField>
        <FormField label="State / region" name="stateRegion" optional state={state}>
          <Input defaultValue={d?.stateRegion ?? undefined} maxLength={120} />
        </FormField>
        <FormField label="City" name="city" optional state={state}>
          <Input defaultValue={d?.city ?? undefined} maxLength={120} />
        </FormField>
        <FormField label="Postal code" name="postalCode" optional state={state}>
          <Input defaultValue={d?.postalCode ?? undefined} maxLength={20} />
        </FormField>
        <FormField label="Address" name="addressLine1" optional state={state} className="sm:col-span-2">
          <Input defaultValue={d?.addressLine1 ?? undefined} maxLength={200} />
        </FormField>
        <FormField label="Address line 2" name="addressLine2" optional state={state} className="sm:col-span-2">
          <Input defaultValue={d?.addressLine2 ?? undefined} maxLength={200} />
        </FormField>
        <FormField label="Time zone" name="timezone" optional state={state} hint="Used when scheduling interviews here, for example Asia/Dubai.">
          <Input defaultValue={d?.timezone ?? undefined} maxLength={64} placeholder="Asia/Kolkata" />
        </FormField>
        <FormField label="Site contact name" name="contactName" optional state={state}>
          <Input defaultValue={d?.contactName ?? undefined} maxLength={120} />
        </FormField>
        <FormField label="Site contact email" name="contactEmail" optional state={state}>
          <Input type="email" defaultValue={d?.contactEmail ?? undefined} maxLength={254} />
        </FormField>
        <FormField label="Site contact phone" name="contactPhone" optional state={state}>
          <Input type="tel" defaultValue={d?.contactPhone ?? undefined} maxLength={24} />
        </FormField>
      </div>
      <div className="flex items-start gap-3">
        <input
          id={`hq-${d?.id ?? "new"}`}
          type="checkbox"
          name="isHeadquarters"
          value="true"
          defaultChecked={d?.isHeadquarters}
          className="mt-1 size-4 shrink-0 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <label htmlFor={`hq-${d?.id ?? "new"}`} className="text-sm leading-6">
          This is our headquarters (replaces the current headquarters)
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {d ? "Save branch" : "Add branch"}
        </SubmitButton>
      </div>
    </form>
  );
}

function BranchDialog({ branch, countries, trigger }: { branch?: BranchItem; countries: SelectOption[]; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen} trigger={trigger} title={branch ? `Edit ${branch.name}` : "Add a branch"} description="Offices and work sites candidates can be hired for." size="lg">
      <BranchForm branch={branch} countries={countries} onDone={() => setOpen(false)} />
    </ResponsiveDialog>
  );
}

export function BranchesManager({ branches, countries }: { branches: BranchItem[]; countries: SelectOption[] }) {
  const countryName = (code: string) => countries.find((c) => c.value === code)?.label ?? code;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BranchDialog
          countries={countries}
          trigger={
            <Button variant="outline" size="sm">
              <Plus aria-hidden="true" /> Add branch
            </Button>
          }
        />
      </div>
      {branches.length === 0 ? (
        <EmptyState size="sm" title="No branches yet" description="Add offices or work sites so jobs and team members can be linked to them." icon={<MapPin aria-hidden="true" />} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {branches.map((b) => (
            <li key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{b.name}</p>
                  {b.isHeadquarters ? <StatusBadge tone="brand" size="sm">Headquarters</StatusBadge> : null}
                  {!b.isActive ? <StatusBadge tone="neutral" size="sm">Inactive</StatusBadge> : null}
                </div>
                <p className="text-sm text-muted-foreground">{[b.city, b.stateRegion, countryName(b.countryCode)].filter(Boolean).join(", ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <BranchDialog
                  branch={b}
                  countries={countries}
                  trigger={
                    <Button variant="outline" size="sm" aria-label={`Edit ${b.name}`}>
                      <Pencil aria-hidden="true" /> Edit
                    </Button>
                  }
                />
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      {b.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  }
                  title={b.isActive ? `Deactivate ${b.name}?` : `Reactivate ${b.name}?`}
                  description={b.isActive ? "It stays on past jobs and members but is hidden from selectors. A deactivated headquarters loses that role." : "It will be available in selectors again."}
                  confirmLabel={b.isActive ? "Deactivate" : "Reactivate"}
                  variant={b.isActive ? "destructive" : "default"}
                  onConfirm={() => setBranchActiveAction({ branchId: b.id, isActive: !b.isActive })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
