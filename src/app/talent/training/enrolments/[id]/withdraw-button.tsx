"use client";

import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

import { withdrawEnrolmentFormAction } from "../../actions";

/** Withdraw from a batch (confirmed; the optional reason is shared with the training provider). */
export function WithdrawButton({ enrolmentId, inProgress }: { enrolmentId: string; inProgress: boolean }) {
  const t = useT("talent-training");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">{t("withdraw.button")}</Button>}
      title={t("withdraw.title")}
      description={inProgress ? t("withdraw.descriptionInProgress") : t("withdraw.description")}
      confirmLabel={t("withdraw.confirm")}
      cancelLabel={t("withdraw.cancel")}
      pendingLabel={t("withdraw.pending")}
      variant="destructive"
      successMessage={t("withdraw.success")}
      onConfirm={async (formData: FormData) => {
        const reason = String(formData.get("reason") ?? "").trim();
        const result = await withdrawEnrolmentFormAction({ enrolmentId, reason: reason || undefined });
        return result.ok ? { ok: true, message: t("withdraw.success") } : result;
      }}
      onSuccess={() => router.refresh()}
    >
      <div className="space-y-1.5">
        <Label htmlFor="withdraw-reason">{t("withdraw.reasonLabel")}</Label>
        <Textarea id="withdraw-reason" name="reason" maxLength={500} rows={3} />
        <p className="text-xs text-muted-foreground">{t("withdraw.reasonHint")}</p>
      </div>
    </ConfirmDialog>
  );
}
