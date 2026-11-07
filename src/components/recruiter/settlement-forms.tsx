"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { disputeSettlementAction, submitPartnerInvoiceAction } from "@/modules/commercial/actions";

import { useRecruiterForm } from "./use-form-action";

/** Raise a query about an approved or paid settlement (sent to the Venkat Sai finance team). */
export function SettlementDisputeForm({ settlementId }: { settlementId: string }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useRecruiterForm(disputeSettlementAction);
  useActionToast(state, { onSuccess: () => router.refresh() });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="settlementId" value={settlementId} />
      <FormErrorAlert state={state} fieldLabels={{ reason: "What is wrong" }} />
      <FormField label="What is wrong" name="reason" required state={state} hint="For example a missing placement or an incorrect amount. At least 10 characters.">
        <Textarea rows={4} maxLength={2000} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Sending…" variant="outline">
          Raise a query
        </SubmitButton>
      </div>
    </form>
  );
}

/** Record the partner's own invoice number (and optionally the invoice file) against the settlement. */
export function PartnerInvoiceForm({ settlementId, organizationId, defaultNumber, canUpload }: { settlementId: string; organizationId: string; defaultNumber: string | null; canUpload: boolean }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useRecruiterForm(submitPartnerInvoiceAction);
  const [uploading, setUploading] = useState(false);
  useActionToast(state, { onSuccess: () => router.refresh() });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="settlementId" value={settlementId} />
      <FormErrorAlert state={state} fieldLabels={{ partnerInvoiceNumber: "Your invoice number", partnerInvoiceFileId: "Invoice file" }} />
      <FormField label="Your invoice number" name="partnerInvoiceNumber" required state={state} hint="The number on the invoice your agency raised to Venkat Sai.">
        <Input defaultValue={defaultNumber ?? undefined} maxLength={60} />
      </FormField>
      {canUpload ? (
        <FileUpload
          purpose="org_document"
          name="partnerInvoiceFileId"
          organizationId={organizationId}
          label="Invoice file (optional)"
          description="PDF, up to 15 MB."
          onUploadingChange={setUploading}
        />
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={uploading} pendingLabel="Saving…">
          Save invoice details
        </SubmitButton>
      </div>
    </form>
  );
}
