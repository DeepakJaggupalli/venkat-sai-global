"use client";

import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";

import { useTalentMessages } from "../use-talent-action";

const DialogCloseContext = createContext<() => void>(() => undefined);

/** Close the surrounding EditDialog (no-op outside one). Forms call it after a successful save. */
export function useDialogClose(): () => void {
  return useContext(DialogCloseContext);
}

/**
 * Edit dialog for one profile section or item. Server pages pass the form element as children;
 * the form closes the dialog through useDialogClose() after a successful save.
 */
export function EditDialog({
  mode = "edit",
  triggerLabel,
  srLabel,
  title,
  description,
  size = "lg",
  children,
}: {
  mode?: "edit" | "add";
  triggerLabel: string;
  /** Accessible name when the visible label is generic ("Edit" → "Edit education: B.Tech"). */
  srLabel?: string;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Icon = mode === "add" ? Plus : Pencil;
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      size={size}
      title={title}
      description={description}
      trigger={
        <Button type="button" variant={mode === "add" ? "default" : "outline"} size="sm" aria-label={srLabel}>
          <Icon aria-hidden="true" />
          {triggerLabel}
        </Button>
      }
    >
      <DialogCloseContext.Provider value={() => setOpen(false)}>
        <div className="max-h-[75vh] overflow-y-auto px-1 pb-1">{children}</div>
      </DialogCloseContext.Provider>
    </ResponsiveDialog>
  );
}

type ItemAction = (input: { id: string }) => Promise<ActionResult<unknown>>;

/** Delete with confirmation; failures are shown in the candidate's language. */
export function DeleteItemButton({ action, id, itemLabel }: { action: ItemAction; id: string; itemLabel: string }) {
  const { t, translateError } = useTalentMessages();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" aria-label={`${t("action.delete")}: ${itemLabel}`}>
          <Trash2 aria-hidden="true" />
          <span className="hidden sm:inline">{t("action.delete")}</span>
        </Button>
      }
      title={t("confirm.deleteTitle", { item: itemLabel })}
      description={t("confirm.deleteDescription")}
      confirmLabel={t("action.delete")}
      cancelLabel={t("action.cancel")}
      pendingLabel={t("form.saving")}
      variant="destructive"
      successMessage={t("toast.deleted")}
      onConfirm={async () => {
        const result = await action({ id });
        return result.ok ? result : { ...result, error: translateError(result) };
      }}
    />
  );
}

/** Send an item to Venkat Sai for verification (approval centre). */
export function SubmitVerificationButton({ action, id, itemLabel }: { action: ItemAction; id: string; itemLabel: string }) {
  const { t, translateError } = useTalentMessages();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-disabled={pending || undefined}
      aria-label={`${t("action.submitVerification")}: ${itemLabel}`}
      onClick={() => {
        if (pending) return;
        startTransition(async () => {
          const result = await action({ id });
          if (result.ok) {
            toast.success(t("toast.submittedVerification"));
            router.refresh();
          } else toast.error(translateError(result));
        });
      }}
    >
      <Send aria-hidden="true" />
      {pending ? t("form.saving") : t("action.submitVerification")}
    </Button>
  );
}

/** Shareable-with-employers switch for one document (turning it off revokes access at once). */
export function DocumentSharingToggle({
  action,
  id,
  shared,
  itemLabel,
}: {
  action: (input: { id: string; isShareableWithEmployers: boolean }) => Promise<ActionResult<unknown>>;
  id: string;
  shared: boolean;
  itemLabel: string;
}) {
  const { t, translateError } = useTalentMessages();
  const [value, setValue] = useState(shared);
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        role="switch"
        checked={value}
        aria-checked={value}
        disabled={pending}
        aria-label={`${t("documents.shareable")}: ${itemLabel}`}
        className="size-4 accent-teal-strong"
        onChange={(event) => {
          const next = event.target.checked;
          setValue(next);
          startTransition(async () => {
            const result = await action({ id, isShareableWithEmployers: next });
            if (result.ok) toast.success(next ? t("documents.sharedOn") : t("documents.sharedOff"));
            else {
              setValue(!next);
              toast.error(translateError(result));
            }
          });
        }}
      />
      <span aria-hidden="true">{t("documents.shareable")}</span>
    </label>
  );
}
