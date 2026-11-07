"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/client";

import { deleteAlertAction, toggleAlertAction } from "./actions";

/** On / off switch, edit link and delete (confirmed) for one alert. */
export function AlertControls({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const t = useT("talent-jobs");
  const [active, setActive] = useState(isActive);
  const [pending, startTransition] = useTransition();
  const switchId = useId();

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await toggleAlertAction({ id, isActive: next });
      if (!result.ok) {
        setActive(!next);
        toast.error(result.error);
        return;
      }
      toast.success(next ? t("alerts.turnedOn") : t("alerts.paused"));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Switch id={switchId} checked={active} onCheckedChange={toggle} disabled={pending} aria-describedby={`${switchId}-state`} />
        <Label htmlFor={switchId} className="text-sm font-normal">
          {t("alerts.active")}
        </Label>
        <span id={`${switchId}-state`} className="sr-only">
          {active ? t("alerts.stateOn") : t("alerts.statePaused")}
        </span>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={`/talent/alerts?edit=${id}`} scroll={false} aria-label={t("alerts.editNamed", { name })}>
          <Pencil aria-hidden="true" />
          {t("common.edit")}
        </Link>
      </Button>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm" aria-label={t("alerts.deleteNamed", { name })}>
            <Trash2 aria-hidden="true" />
            {t("common.delete")}
          </Button>
        }
        title={t("alerts.deleteTitle")}
        description={t("alerts.deleteDescription", { name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        pendingLabel={t("common.working")}
        variant="destructive"
        onConfirm={() => deleteAlertAction({ id })}
        successMessage={t("alerts.deleted")}
      />
    </div>
  );
}
