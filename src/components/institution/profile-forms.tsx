"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FileUpload } from "@/components/files";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FileSummary } from "@/modules/files/types";
import {
  addOrganizationDocumentAction,
  removeOrganizationDocumentAction,
  setOrganizationLogoAction,
  setOrganizationPublicAction,
  submitVerificationAction,
  updateOrganizationAction,
} from "@/modules/organizations/actions";
import { updateInstitutionProfileAction } from "@/modules/organizations/institution-actions";

import { INSTITUTION_FIELD_LABELS, InstitutionDetailsFields, type InstitutionDetailsDefaults } from "./institution-details-fields";
import { useInstitutionForm } from "./use-form-action";

// ---------------------------------------------------------------------------
// Organisation details
// ---------------------------------------------------------------------------

export function InstitutionDetailsForm({
  defaults,
  countries,
  industries,
  identityLocked,
}: {
  defaults: InstitutionDetailsDefaults;
  countries: SelectOption[];
  industries: SelectOption[];
  identityLocked: boolean;
}) {
  const { state, pending, onSubmit } = useInstitutionForm(updateOrganizationAction);
  useActionToast(state);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Organisation details">
      <input type="hidden" name="orgType" value="institution" />
      <FormErrorAlert state={state} fieldLabels={INSTITUTION_FIELD_LABELS} />
      <InstitutionDetailsFields state={state} defaults={defaults} countries={countries} industries={industries} identityLocked={identityLocked} />
      <div className="flex justify-end border-t border-border pt-4">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save details
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Institution profile (kind, accreditation, public page content, placement contact)
// ---------------------------------------------------------------------------

export type InstitutionProfileDefaults = {
  institutionKind: string | null;
  accreditationBodies: string[];
  affiliation: string | null;
  establishedYear: number | null;
  studentCapacity: number | null;
  campusAddress: string | null;
  aboutHtml: string | null;
  cover: FileSummary | null;
  placementOfficerName: string | null;
  placementOfficerEmail: string | null;
  placementOfficerPhone: string | null;
};

const PROFILE_LABELS = {
  institutionKind: "Kind of institution",
  accreditationBodies: "Accreditation / recognition bodies",
  affiliation: "Affiliation",
  establishedYear: "Year established",
  studentCapacity: "Student capacity",
  campusAddress: "Campus address",
  aboutHtml: "About the institution",
  coverFileId: "Cover image",
  placementOfficerName: "Placement officer name",
  placementOfficerEmail: "Placement officer email",
  placementOfficerPhone: "Placement officer phone",
};

export function InstitutionProfileForm({ organizationId, defaults, kindOptions }: { organizationId: string; defaults: InstitutionProfileDefaults; kindOptions: SelectOption[] }) {
  const { state, pending, onSubmit } = useInstitutionForm(updateInstitutionProfileAction);
  const [uploading, setUploading] = useState(false);
  useActionToast(state);
  const L = PROFILE_LABELS;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Institution profile">
      <FormErrorAlert state={state} fieldLabels={L} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={L.institutionKind} name="institutionKind" state={state} hint="Needed for verification.">
          <SimpleSelect options={kindOptions} defaultValue={defaults.institutionKind ?? undefined} placeholder="Choose one" />
        </FormField>
        <FormField label={L.establishedYear} name="establishedYear" optional state={state}>
          <Input type="number" inputMode="numeric" min={1800} max={2100} defaultValue={defaults.establishedYear ?? undefined} />
        </FormField>
        <FormField
          label={L.accreditationBodies}
          name="accreditationBodies"
          optional
          state={state}
          hint="Shown as declared on your public page until Venkat Sai has checked the supporting documents."
          className="sm:col-span-2"
        >
          {(field) => <TagInput {...field} name="accreditationBodies" defaultValue={defaults.accreditationBodies} maxLength={200} placeholder="Type a body and press Enter" />}
        </FormField>
        <FormField label={L.affiliation} name="affiliation" optional state={state} className="sm:col-span-2">
          <Input maxLength={300} defaultValue={defaults.affiliation ?? undefined} />
        </FormField>
        <FormField label={L.studentCapacity} name="studentCapacity" optional state={state}>
          <Input type="number" inputMode="numeric" min={0} defaultValue={defaults.studentCapacity ?? undefined} />
        </FormField>
        <FormField label={L.campusAddress} name="campusAddress" optional state={state} hint="If training happens somewhere other than your registered address.">
          <Textarea rows={2} maxLength={500} defaultValue={defaults.campusAddress ?? undefined} />
        </FormField>
      </div>
      <FormField label={L.aboutHtml} name="aboutHtml" optional state={state} hint="Shown on your public institution page once you are verified.">
        {(field) => <RichTextEditor {...field} name="aboutHtml" defaultValue={defaults.aboutHtml} maxLength={20_000} minHeight="md" />}
      </FormField>
      <FileUpload
        purpose="org_logo"
        name="coverFileId"
        organizationId={organizationId}
        visibility="public"
        label={L.coverFileId}
        description="Optional wide image for your public page. JPG, PNG or WebP up to 5 MB. Do not use photos of identifiable learners without their consent."
        defaultFiles={defaults.cover ? [defaults.cover] : []}
        onUploadingChange={setUploading}
      />
      <fieldset className="space-y-3">
        <legend className="font-heading text-base font-semibold text-foreground">Placement contact</legend>
        <p className="text-sm text-muted-foreground">Shared with Venkat Sai staff and participating employers only.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={L.placementOfficerName} name="placementOfficerName" optional state={state}>
            <Input maxLength={120} defaultValue={defaults.placementOfficerName ?? undefined} autoComplete="off" />
          </FormField>
          <FormField label={L.placementOfficerEmail} name="placementOfficerEmail" optional state={state}>
            <Input type="email" maxLength={254} defaultValue={defaults.placementOfficerEmail ?? undefined} autoComplete="off" />
          </FormField>
          <FormField label={L.placementOfficerPhone} name="placementOfficerPhone" optional state={state}>
            <Input type="tel" maxLength={24} defaultValue={defaults.placementOfficerPhone ?? undefined} autoComplete="off" />
          </FormField>
        </div>
      </fieldset>
      <div className="flex justify-end border-t border-border pt-4">
        <SubmitButton pending={pending} disabled={uploading} pendingLabel="Saving…">
          Save profile
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Logo and public page
// ---------------------------------------------------------------------------

export function InstitutionBranding({ organizationId, logo, isPublic }: { organizationId: string; logo: FileSummary | null; isPublic: boolean }) {
  const router = useRouter();
  const [publicPage, setPublicPage] = useState(isPublic);
  const [saving, setSaving] = useState(false);

  async function saveLogo(fileId: string | null) {
    const result = await setOrganizationLogoAction({ orgType: "institution", fileId });
    if (result.ok) {
      toast.success(result.message ?? "Logo saved.");
      router.refresh();
    } else toast.error(result.error);
  }

  async function togglePublic(next: boolean) {
    setSaving(true);
    setPublicPage(next);
    const result = await setOrganizationPublicAction({ orgType: "institution", isPublic: next });
    setSaving(false);
    if (result.ok) toast.success(result.message ?? "Saved.");
    else {
      setPublicPage(!next);
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-6">
      <FileUpload
        purpose="org_logo"
        name="logoFileId"
        organizationId={organizationId}
        visibility="public"
        label="Logo"
        description="Square JPG, PNG or WebP up to 5 MB. Shown on your public page and course listings."
        defaultFiles={logo ? [logo] : []}
        onChange={(files) => {
          const next = files[0]?.id ?? null;
          if (next !== (logo?.id ?? null)) void saveLogo(next);
        }}
      />
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          <label htmlFor="public-page" className="font-medium text-foreground">
            Public institution page
          </label>
          <p id="public-page-hint" className="text-sm text-muted-foreground">
            Shown on Venkat Sai Global only while your institution is verified. Accreditation bodies are labelled as declared.
          </p>
        </div>
        <Switch id="public-page" checked={publicPage} disabled={saving} onCheckedChange={(v) => void togglePublic(v)} aria-describedby="public-page-hint" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents and verification
// ---------------------------------------------------------------------------

const DOCUMENT_LABELS = {
  documentType: "Document type",
  fileId: "File",
  title: "Title",
  documentNumber: "Document number",
  issuedBy: "Issued by",
  issuedOn: "Issue date",
  expiresOn: "Expiry date",
};

export function InstitutionDocumentForm({ organizationId, typeOptions, defaultType }: { organizationId: string; typeOptions: SelectOption[]; defaultType?: string }) {
  const { state, pending, onSubmit } = useInstitutionForm(addOrganizationDocumentAction);
  const [formKey, setFormKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const last = useRef(state);
  useActionToast(state);
  useEffect(() => {
    if (state !== last.current && state?.ok) setFormKey((k) => k + 1);
    last.current = state;
  }, [state]);
  const fileError = state?.ok === false && state.fieldErrors?.fileId;

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Add a document">
      <input type="hidden" name="orgType" value="institution" />
      <FormErrorAlert state={state} fieldLabels={DOCUMENT_LABELS} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Document type" name="documentType" required state={state}>
          <SimpleSelect options={typeOptions} defaultValue={defaultType} placeholder="Choose a document type" />
        </FormField>
        <FormField label="Title" name="title" optional state={state} hint="For example NCVT affiliation 2026.">
          <Input maxLength={200} />
        </FormField>
      </div>
      <FileUpload
        purpose="org_document"
        name="fileId"
        organizationId={organizationId}
        label="File"
        description="PDF or a clear photo, up to 15 MB. All pages in one file."
        required
        invalid={Boolean(fileError)}
        errorId="document-file-error"
        onUploadingChange={setUploading}
      />
      {fileError ? (
        <p id="document-file-error" className="text-sm font-medium text-danger-strong">
          Upload the document file.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Document number" name="documentNumber" optional state={state}>
          <Input maxLength={100} />
        </FormField>
        <FormField label="Issued by" name="issuedBy" optional state={state} hint="The authority, university or board that issued it.">
          <Input maxLength={200} />
        </FormField>
        <FormField label="Issue date" name="issuedOn" optional state={state}>
          <Input type="date" />
        </FormField>
        <FormField label="Expiry date" name="expiresOn" optional state={state} hint="As printed. The document is valid through this day.">
          <Input type="date" />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={uploading} pendingLabel="Adding…">
          Add document
        </SubmitButton>
      </div>
    </form>
  );
}

export function RemoveDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          Remove<span className="sr-only"> {title}</span>
        </Button>
      }
      title={`Remove ${title}?`}
      description="Documents that are part of a submitted or approved verification cannot be removed."
      confirmLabel="Remove document"
      variant="destructive"
      onConfirm={() => removeOrganizationDocumentAction({ orgType: "institution", documentId })}
    />
  );
}

export function SubmitVerificationButton({ renewal, disabled }: { renewal: boolean; disabled: boolean }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button disabled={disabled}>{renewal ? "Submit renewal" : "Submit for verification"}</Button>}
      title={renewal ? "Submit your renewal?" : "Submit your institution for verification?"}
      description="Venkat Sai reviews your details and documents and emails you the decision. While the review is open you cannot change your institution name, registration number, tax ID or country."
      confirmLabel={renewal ? "Submit renewal" : "Submit"}
      onConfirm={async () => {
        const result = await submitVerificationAction({ orgType: "institution" });
        // The organisations service records organization_verification_submitted after commit.
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
