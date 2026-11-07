"use client";

import { Check, Upload, X } from "lucide-react";
import { useId, useState } from "react";

import { FileUpload } from "@/components/files";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";

import { respondOfferAction, submitChecklistAction, withdrawAction } from "./actions";

/** Withdraw an application, with an optional reason (shared with the hiring team as the candidate's own words). */
export function WithdrawApplicationButton({ applicationId, jobTitle }: { applicationId: string; jobTitle: string }) {
  const t = useT("talent-jobs");
  const reasonId = useId();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" data-testid="withdraw-application">
          {t("applications.withdraw")}
        </Button>
      }
      title={t("applications.withdrawTitle")}
      description={t("applications.withdrawDescription", { title: jobTitle })}
      confirmLabel={t("applications.withdrawConfirm")}
      cancelLabel={t("applications.keep")}
      pendingLabel={t("common.working")}
      variant="destructive"
      successMessage={t("applications.withdrawn")}
      onConfirm={(formData) => {
        const reason = String(formData.get("reason") ?? "").trim();
        return withdrawAction({ applicationId, reason: reason || undefined });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={reasonId}>
          {t("applications.withdrawReason")} <span className="text-xs font-normal text-muted-foreground">({t("form.optional")})</span>
        </Label>
        <Textarea id={reasonId} name="reason" rows={3} maxLength={1000} />
      </div>
    </ConfirmDialog>
  );
}

/** Accept (optionally with a countersigned letter) or decline (optional reason) an issued offer. */
export function OfferResponse({ offerId }: { offerId: string }) {
  const t = useT("talent-jobs");
  const reasonId = useId();
  const [signedFileId, setSignedFileId] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        trigger={
          <Button type="button" data-testid="accept-offer">
            <Check aria-hidden="true" />
            {t("offers.accept")}
          </Button>
        }
        title={t("offers.acceptTitle")}
        description={t("offers.acceptDescription")}
        confirmLabel={t("offers.accept")}
        cancelLabel={t("common.cancel")}
        pendingLabel={t("common.working")}
        successMessage={t("offers.accepted")}
        onConfirm={() => respondOfferAction({ offerId, response: "accept", signedOfferFileId: signedFileId })}
      >
        <FileUpload
          purpose="application_attachment"
          name="signedOfferFileId"
          label={t("offers.signedCopy")}
          description={t("offers.signedCopyHint")}
          onChange={(files) => setSignedFileId(files[0]?.id ?? null)}
        />
      </ConfirmDialog>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="outline" data-testid="decline-offer">
            <X aria-hidden="true" />
            {t("offers.decline")}
          </Button>
        }
        title={t("offers.declineTitle")}
        description={t("offers.declineDescription")}
        confirmLabel={t("offers.decline")}
        cancelLabel={t("common.cancel")}
        pendingLabel={t("common.working")}
        variant="destructive"
        successMessage={t("offers.declined")}
        onConfirm={(formData) => {
          const reason = String(formData.get("declineReason") ?? "").trim();
          return respondOfferAction({ offerId, response: "decline", declineReason: reason || undefined });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>
            {t("offers.declineReason")} <span className="text-xs font-normal text-muted-foreground">({t("form.optional")})</span>
          </Label>
          <Textarea id={reasonId} name="declineReason" rows={3} maxLength={1000} />
        </div>
      </ConfirmDialog>
    </div>
  );
}

/** Upload a requested document (mobilisation checklist item) for checking by Venkat Sai. */
export function ChecklistSubmit({ itemId, itemName }: { itemId: string; itemName: string }) {
  const t = useT("talent-jobs");
  const noteId = useId();
  const [fileId, setFileId] = useState<string | null>(null);
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm" aria-label={t("documents.submitNamed", { name: itemName })}>
          <Upload aria-hidden="true" />
          {t("documents.submit")}
        </Button>
      }
      title={t("documents.submitTitle", { name: itemName })}
      description={t("documents.submitDescription")}
      confirmLabel={t("documents.send")}
      cancelLabel={t("common.cancel")}
      pendingLabel={t("common.working")}
      successMessage={t("documents.sent")}
      onConfirm={(formData) => {
        const note = String(formData.get("note") ?? "").trim();
        if (!fileId && !note) return { ok: false as const, error: t("documents.needFileOrNote") };
        return submitChecklistAction({ itemId, fileId, note: note || undefined });
      }}
    >
      <div className="space-y-3">
        <FileUpload purpose="mobilisation_document" name="fileId" label={t("documents.file")} onChange={(files) => setFileId(files[0]?.id ?? null)} />
        <div className="space-y-1.5">
          <Label htmlFor={noteId}>
            {t("documents.note")} <span className="text-xs font-normal text-muted-foreground">({t("form.optional")})</span>
          </Label>
          <Textarea id={noteId} name="note" rows={2} maxLength={1000} />
        </div>
      </div>
    </ConfirmDialog>
  );
}
