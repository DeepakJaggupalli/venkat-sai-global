"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FileUpload } from "@/components/files";
import { useRecruiterForm } from "@/components/recruiter/use-form-action";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { CountrySelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult, ActionState } from "@/lib/actions";
import type { FileSummary } from "@/modules/files/types";
import { PARTNER_LICENCE_TYPE_LABELS, PARTNER_LICENCE_TYPES } from "@/modules/organizations/constants";
import { addPartnerLicenceAction, deletePartnerLicenceAction, updatePartnerLicenceAction } from "@/modules/organizations/partner-actions";

type FormAction = (prev: ActionState<unknown>, formData: FormData) => Promise<ActionResult<unknown>>;

export type LicenceDefaults = {
  id: string;
  licenceType: string;
  licenceNumber: string;
  issuingAuthority: string | null;
  issuingCountryCode: string;
  issuingRegion: string | null;
  validFrom: string | null;
  validUntil: string | null;
  holderName: string | null;
  registeredAddress: string | null;
  authorisedActivities: string[];
  branchOffices: string[];
  file: FileSummary | null;
};

const FIELD_LABELS = {
  licenceType: "Licence type",
  licenceNumber: "Licence number",
  issuingAuthority: "Issuing authority",
  issuingCountryCode: "Issuing country",
  issuingRegion: "State or region",
  validFrom: "Valid from",
  validUntil: "Valid until",
  fileId: "Licence scan",
  holderName: "Holder name",
  registeredAddress: "Registered address",
};

function LicenceForm({ organizationId, countries, defaults, onDone }: { organizationId: string; countries: SelectOption[]; defaults?: LicenceDefaults; onDone: () => void }) {
  const { state, pending, onSubmit } = useRecruiterForm<unknown>((defaults ? updatePartnerLicenceAction : addPartnerLicenceAction) as FormAction);
  const [uploading, setUploading] = useState(false);
  const [type, setType] = useState(defaults?.licenceType ?? "india_recruiting_agent");
  const last = useRef(state);
  useActionToast(state);
  useEffect(() => {
    if (state !== last.current && state?.ok) onDone();
    last.current = state;
  }, [state, onDone]);
  const fileError = state?.ok === false ? state.fieldErrors?.fileId : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {defaults ? <input type="hidden" name="licenceId" value={defaults.id} /> : null}
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Licence type" name="licenceType" required state={state} className="sm:col-span-2">
          <SimpleSelect options={PARTNER_LICENCE_TYPES.map((v) => ({ value: v, label: PARTNER_LICENCE_TYPE_LABELS[v] }))} value={type} onValueChange={setType} />
        </FormField>
        <FormField
          label={type === "india_recruiting_agent" ? "Registration certificate number (RC number)" : "Licence number"}
          name="licenceNumber"
          required
          state={state}
          hint={type === "india_recruiting_agent" ? "Exactly as printed on your eMigrate registration certificate." : undefined}
        >
          <Input defaultValue={defaults?.licenceNumber} maxLength={100} />
        </FormField>
        <FormField label="Issuing authority" name="issuingAuthority" optional state={state} hint={type === "india_recruiting_agent" ? "Usually the Protector General of Emigrants." : "As printed on the licence."}>
          <Input defaultValue={defaults?.issuingAuthority ?? undefined} maxLength={200} />
        </FormField>
        <FormField label="Issuing country" name="issuingCountryCode" required state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults?.issuingCountryCode ?? (type === "india_recruiting_agent" ? "IN" : undefined)} />}
        </FormField>
        <FormField label="State or region" name="issuingRegion" optional state={state} hint="For licences issued by a state, emirate or province.">
          <Input defaultValue={defaults?.issuingRegion ?? undefined} maxLength={120} />
        </FormField>
        <FormField label="Valid from" name="validFrom" optional state={state}>
          <Input type="date" defaultValue={defaults?.validFrom ?? undefined} />
        </FormField>
        <FormField label="Valid until" name="validUntil" optional state={state} hint="Leave empty only if no expiry is printed.">
          <Input type="date" defaultValue={defaults?.validUntil ?? undefined} />
        </FormField>
        <FormField label="Holder name" name="holderName" optional state={state} hint="Exactly as printed.">
          <Input defaultValue={defaults?.holderName ?? undefined} maxLength={200} />
        </FormField>
        <FormField label="Registered address" name="registeredAddress" optional state={state}>
          <Input defaultValue={defaults?.registeredAddress ?? undefined} maxLength={500} />
        </FormField>
        <FormField label="Authorised activities" name="authorisedActivities" optional state={state} hint="As printed. Press Enter after each.">
          {(field) => <TagInput {...field} name="authorisedActivities" defaultValue={defaults?.authorisedActivities} maxTags={20} maxLength={200} placeholder="Add an activity" />}
        </FormField>
        <FormField label="Branch offices" name="branchOffices" optional state={state} hint="Listed on the licence.">
          {(field) => <TagInput {...field} name="branchOffices" defaultValue={defaults?.branchOffices} maxTags={20} maxLength={200} placeholder="Add a branch" />}
        </FormField>
      </div>
      <FileUpload
        purpose="partner_licence"
        name="fileId"
        organizationId={organizationId}
        label="Licence scan"
        description="PDF or a clear photo of every page, up to 15 MB. Needed before Venkat Sai can verify the licence."
        defaultFiles={defaults?.file ? [defaults.file] : []}
        invalid={Boolean(fileError)}
        errorId="licence-file-error"
        onUploadingChange={setUploading}
      />
      {fileError ? (
        <p id="licence-file-error" className="text-sm font-medium text-danger-strong">
          {fileError[0]}
        </p>
      ) : null}
      {defaults ? <p className="text-sm text-muted-foreground">Saving changes sends the licence back to Venkat Sai for verification.</p> : null}
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={uploading} pendingLabel="Saving…">
          {defaults ? "Save and send for verification" : "Add licence"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function AddLicenceButton({ organizationId, countries }: { organizationId: string; countries: SelectOption[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="Add a licence"
      description="Venkat Sai checks every licence against the issuer's records before it counts towards your verification."
      trigger={
        <Button>
          <Plus aria-hidden="true" /> Add licence
        </Button>
      }
    >
      <LicenceForm organizationId={organizationId} countries={countries} onDone={close} />
    </ResponsiveDialog>
  );
}

export function LicenceRowActions({ organizationId, countries, licence, canDelete }: { organizationId: string; countries: SelectOption[]; licence: LicenceDefaults; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const name = PARTNER_LICENCE_TYPE_LABELS[licence.licenceType as keyof typeof PARTNER_LICENCE_TYPE_LABELS] ?? "licence";
  return (
    <div className="flex flex-wrap gap-2">
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Update licence"
        description="Use this for renewals and corrections."
        trigger={
          <Button variant="outline" size="sm" aria-label={`Update ${name} ${licence.licenceNumber}`}>
            <Pencil aria-hidden="true" /> Update
          </Button>
        }
      >
        <LicenceForm organizationId={organizationId} countries={countries} defaults={licence} onDone={close} />
      </ResponsiveDialog>
      {canDelete ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" aria-label={`Remove ${name} ${licence.licenceNumber}`}>
              <Trash2 aria-hidden="true" /> Remove
            </Button>
          }
          title="Remove this licence?"
          description="It will no longer count towards your verification."
          confirmLabel="Remove licence"
          variant="destructive"
          onConfirm={() => deletePartnerLicenceAction({ licenceId: licence.id })}
        />
      ) : null}
    </div>
  );
}
