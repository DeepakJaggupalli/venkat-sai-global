"use client";

import { Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { track } from "@/modules/analytics/client";

import { removeCompanyDocumentAction, submitCompanyVerificationAction } from "../actions";

export function RemoveDocumentButton({ documentId, label }: { documentId: string; label: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Remove ${label}`}>
          <Trash2 aria-hidden="true" /> Remove
        </Button>
      }
      title="Remove this document?"
      description="It will no longer be part of your verification. You can upload a replacement."
      confirmLabel="Remove document"
      variant="destructive"
      onConfirm={() => removeCompanyDocumentAction({ documentId })}
    />
  );
}

/** Submit (or resubmit / renew) the company for verification. */
export function SubmitVerificationButton({ disabled, renewal, resubmit }: { disabled: boolean; renewal: boolean; resubmit: boolean }) {
  const label = renewal ? "Submit renewal" : resubmit ? "Resubmit for verification" : "Submit for verification";
  return (
    <ConfirmDialog
      trigger={
        <Button size="lg" disabled={disabled}>
          {label}
        </Button>
      }
      title={renewal ? "Submit your renewal?" : "Submit your company for verification?"}
      description={
        renewal
          ? "Your company stays verified while Venkat Sai reviews your updated documents."
          : "Venkat Sai will review your details and documents. You cannot change your company name, registration number, tax ID or country while the review is open."
      }
      confirmLabel={label}
      onConfirm={async () => {
        const result = await submitCompanyVerificationAction({});
        if (result.ok) track("form_submitted", { formId: "employer_verification" });
        return result;
      }}
    />
  );
}
