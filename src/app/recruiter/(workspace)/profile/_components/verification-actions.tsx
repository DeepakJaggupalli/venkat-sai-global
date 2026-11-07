"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { track } from "@/modules/analytics/client";

import { removeOrganizationDocumentAction, submitVerificationAction } from "@/modules/organizations/actions";

export function RemoveDocumentButton({ documentId, label }: { documentId: string; label: string }) {
  const router = useRouter();
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
      onConfirm={async () => {
        const result = await removeOrganizationDocumentAction({ orgType: "recruitment_partner", documentId });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}

/** Submit (or resubmit / renew) the agency for verification. */
export function SubmitVerificationButton({ disabled, renewal, resubmit }: { disabled: boolean; renewal: boolean; resubmit: boolean }) {
  const label = renewal ? "Submit renewal" : resubmit ? "Resubmit for verification" : "Submit for verification";
  return (
    <ConfirmDialog
      trigger={
        <Button size="lg" disabled={disabled}>
          {label}
        </Button>
      }
      title={renewal ? "Submit your renewal?" : "Submit your agency for verification?"}
      description={
        renewal
          ? "Your agency stays verified while Venkat Sai reviews your updated documents."
          : "Venkat Sai will review your details and documents. You cannot change your agency name, registration number, tax ID or country while the review is open."
      }
      confirmLabel={label}
      onConfirm={async () => {
        const result = await submitVerificationAction({ orgType: "recruitment_partner" });
        if (result.ok) track("form_submitted", { formId: "partner_verification" });
        return result;
      }}
    />
  );
}
