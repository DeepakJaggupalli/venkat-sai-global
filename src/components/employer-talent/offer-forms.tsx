"use client";

import { FileSignature } from "lucide-react";
import { useState, type FormEvent, type ReactElement } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { CountrySelect, CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FileSummary } from "@/modules/files/types";
import { track } from "@/modules/analytics/client";
import { fromMinorUnits, toMinorUnits } from "@/lib/format";
import { createOfferAction, reviseOfferAction, updateOfferAction } from "@/modules/recruitment/actions";

import { intOf, textOf, useRunAction } from "./use-run-action";

type SalaryPeriod = "hour" | "day" | "week" | "month" | "year" | "project";

export type OfferFormOptions = { currencies: SelectOption[]; countries: SelectOption[]; salaryPeriods: SelectOption[] };

export type OfferFormDefaults = {
  offerId?: string;
  jobTitle: string;
  salaryMinor: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  benefits: string | null;
  countryCode: string | null;
  workLocation: string | null;
  startDate: string | null;
  contractDurationMonths: number | null;
  offerFile: FileSummary | null;
  expiresAt: Date | null;
  internalNotes: string | null;
};

function isoDate(value: Date | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * Create an offer draft for an application, edit a draft, or revise an issued offer (a new draft that
 * supersedes it). Drafts are never shown to the candidate; "Issue" sends it.
 */
export function OfferFormDialog({
  mode,
  applicationId,
  defaults,
  options,
  trigger,
}: {
  mode: "create" | "edit" | "revise";
  applicationId?: string;
  defaults: OfferFormDefaults;
  options: OfferFormOptions;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const done = () => setOpen(false);
  const create = useRunAction(createOfferAction, {
    onSuccess: () => {
      track("form_submitted", { form: "employer_offer_draft" });
      done();
    },
  });
  const update = useRunAction(updateOfferAction, { onSuccess: done });
  const revise = useRunAction(reviseOfferAction, { onSuccess: done });
  const active = mode === "create" ? create : mode === "edit" ? update : revise;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currency = textOf(form, "salaryCurrency") ?? null;
    const amountText = textOf(form, "salaryAmount");
    const amount = amountText !== undefined ? Number(amountText) : null;
    const fields = {
      portal: "employer" as const,
      jobTitle: String(form.get("jobTitle") ?? ""),
      // Without a currency the amount is still sent, so the server explains that a currency and period are needed.
      salaryMinor: amount !== null && Number.isFinite(amount) ? (currency ? toMinorUnits(amount, currency) : Math.round(amount)) : null,
      salaryCurrency: currency,
      salaryPeriod: (textOf(form, "salaryPeriod") ?? null) as SalaryPeriod | null,
      benefits: textOf(form, "benefits") ?? null,
      countryCode: textOf(form, "countryCode") ?? null,
      workLocation: textOf(form, "workLocation") ?? null,
      startDate: textOf(form, "startDate") ?? null,
      contractDurationMonths: intOf(form, "contractDurationMonths") ?? null,
      offerFileId: textOf(form, "offerFileId") ?? null,
      expiresAt: textOf(form, "expiresAt") ? new Date(`${textOf(form, "expiresAt")}T23:59:59`) : null,
      internalNotes: textOf(form, "internalNotes") ?? null,
    };
    if (mode === "create" && applicationId) void create.run({ ...fields, applicationId });
    else if (mode === "edit" && defaults.offerId) void update.run({ ...fields, offerId: defaults.offerId });
    else if (mode === "revise" && defaults.offerId) void revise.run({ ...fields, offerId: defaults.offerId });
  };

  const title = mode === "create" ? "Make an offer" : mode === "edit" ? "Edit offer draft" : "Revise offer";
  const amountDefault = defaults.salaryMinor !== null && defaults.salaryCurrency ? String(fromMinorUnits(defaults.salaryMinor, defaults.salaryCurrency)) : undefined;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) active.reset();
      }}
      size="lg"
      trigger={
        trigger ?? (
          <Button type="button" size="sm" variant={mode === "create" ? "default" : "outline"}>
            <FileSignature aria-hidden className="size-4" />
            {title}
          </Button>
        )
      }
      title={title}
      description={mode === "revise" ? "Creates a new draft that replaces the current offer once you issue it." : "Saved as a draft. The candidate sees it only after you issue it."}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={active.state} />
        <FormField label="Job title" name="jobTitle" required state={active.state}>
          <Input maxLength={200} defaultValue={defaults.jobTitle} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Salary" name="salaryAmount" optional state={active.state} errors={active.state && !active.state.ok ? active.state.fieldErrors?.salaryMinor : undefined}>
            <Input type="number" inputMode="decimal" min={0} step="any" defaultValue={amountDefault} />
          </FormField>
          <FormField label="Currency" name="salaryCurrency" state={active.state}>
            <CurrencySelect options={options.currencies} defaultValue={defaults.salaryCurrency ?? undefined} allowClear clearLabel="None" />
          </FormField>
          <FormField label="Pay period" name="salaryPeriod" state={active.state}>
            <SimpleSelect options={options.salaryPeriods} defaultValue={defaults.salaryPeriod ?? undefined} placeholder="Choose" allowClear clearLabel="None" />
          </FormField>
        </div>
        <FormField label="Benefits" name="benefits" optional state={active.state} hint="Accommodation, food, transport, insurance, leave.">
          <Textarea rows={3} maxLength={4000} defaultValue={defaults.benefits ?? undefined} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Work country" name="countryCode" optional state={active.state}>
            <CountrySelect options={options.countries} defaultValue={defaults.countryCode ?? undefined} allowClear clearLabel="Not set" />
          </FormField>
          <FormField label="Work location" name="workLocation" optional state={active.state}>
            <Input maxLength={300} defaultValue={defaults.workLocation ?? undefined} />
          </FormField>
          <FormField label="Start date" name="startDate" optional state={active.state}>
            <Input type="date" defaultValue={defaults.startDate ?? undefined} />
          </FormField>
          <FormField label="Contract length (months)" name="contractDurationMonths" optional state={active.state}>
            <Input type="number" min={1} max={120} defaultValue={defaults.contractDurationMonths ?? undefined} />
          </FormField>
          <FormField label="Respond by" name="expiresAt" optional state={active.state} hint="The offer expires after this date.">
            <Input type="date" defaultValue={isoDate(defaults.expiresAt)} />
          </FormField>
        </div>
        <FormField label="Offer letter" name="offerFileId" optional state={active.state} hint="PDF preferred. Shared with the candidate when the offer is issued.">
          {(field) => <FileUpload purpose="application_attachment" name="offerFileId" defaultFiles={defaults.offerFile ? [defaults.offerFile] : undefined} id={field.id} errorId={field["aria-describedby"]} invalid={field["aria-invalid"] === true} />}
        </FormField>
        <FormField label="Internal notes" name="internalNotes" optional state={active.state} hint="Never shown to the candidate.">
          <Textarea rows={2} maxLength={4000} defaultValue={defaults.internalNotes ?? undefined} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pending={active.pending} pendingLabel="Saving…">
            Save draft
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
