"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FileUpload } from "@/components/files";
import { useRecruiterForm } from "@/components/recruiter/use-form-action";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";

import { addOrganizationDocumentAction } from "@/modules/organizations/actions";

const FIELD_LABELS = {
  documentType: "Document type",
  fileId: "File",
  title: "Title",
  documentNumber: "Document number",
  issuedBy: "Issued by",
  issuedOn: "Issue date",
  expiresOn: "Expiry date",
};

/** Typed verification document upload. The form resets after each document is added. */
export function DocumentUploadForm({ organizationId, typeOptions, defaultType }: { organizationId: string; typeOptions: SelectOption[]; defaultType?: string }) {
  const { state, pending, onSubmit } = useRecruiterForm(addOrganizationDocumentAction);
  const [formKey, setFormKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const lastState = useRef(state);
  const router = useRouter();
  // The module revalidates /recruiter/profile only; refresh so the verification page shows the new document.
  useActionToast(state, { onSuccess: () => router.refresh() });
  useEffect(() => {
    if (state !== lastState.current && state?.ok) setFormKey((k) => k + 1);
    lastState.current = state;
  }, [state]);

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="orgType" value="recruitment_partner" />
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Document type" name="documentType" required state={state}>
          <SimpleSelect options={typeOptions} defaultValue={defaultType} placeholder="Choose a document type" />
        </FormField>
        <FormField label="Title" name="title" optional state={state} hint="For example Trade licence 2026.">
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
        invalid={Boolean(state?.ok === false && state.fieldErrors?.fileId)}
        errorId="document-file-error"
        onUploadingChange={setUploading}
      />
      {state?.ok === false && state.fieldErrors?.fileId ? (
        <p id="document-file-error" className="text-sm font-medium text-danger-strong">
          Upload the document file.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Document number" name="documentNumber" optional state={state}>
          <Input maxLength={100} />
        </FormField>
        <FormField label="Issued by" name="issuedBy" optional state={state} hint="The authority that issued it.">
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
