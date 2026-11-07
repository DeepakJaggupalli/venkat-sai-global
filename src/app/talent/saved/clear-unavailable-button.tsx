"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

import { clearUnavailableSavedAction } from "./actions";

export function ClearUnavailableButton({ count }: { count: number }) {
  const t = useT("talent-jobs");
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          {t("saved.clearUnavailable")}
        </Button>
      }
      title={t("saved.clearTitle")}
      description={t("saved.clearDescription", { count })}
      confirmLabel={t("saved.clearConfirm")}
      cancelLabel={t("common.cancel")}
      pendingLabel={t("common.working")}
      onConfirm={() => clearUnavailableSavedAction({})}
      successMessage={t("saved.cleared")}
    />
  );
}
