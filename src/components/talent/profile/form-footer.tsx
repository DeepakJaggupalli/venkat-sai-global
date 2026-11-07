"use client";

import { SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import type { ActionResult, ActionState } from "@/lib/actions";

import { useTalentMessages } from "../use-talent-action";

export type FormAction = (prev: ActionState<undefined>, formData: FormData) => Promise<ActionResult<undefined>>;

/** Cancel + Save row at the bottom of every profile editor. */
export function FormFooterBar({ close, label }: { close?: () => void; label?: string }) {
  const { t } = useTalentMessages();
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
      {close ? (
        <Button type="button" variant="outline" onClick={close}>
          {t("action.cancel")}
        </Button>
      ) : null}
      <SubmitButton pendingLabel={t("form.saving")}>{label ?? t("action.save")}</SubmitButton>
    </div>
  );
}
