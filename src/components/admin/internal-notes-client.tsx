"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { addInternalNoteAction, deleteInternalNoteAction, updateInternalNoteAction } from "@/modules/operations/actions";

import { ActionForm } from "./action-form";

export function NoteComposer({ entityType, entityId, organizationId }: { entityType: string; entityId: string; organizationId: string | null }) {
  return (
    <ActionForm
      action={addInternalNoteAction}
      hidden={{ portal: "admin", entityType, entityId, visibility: "staff", organizationId }}
      fields={[
        { name: "body", label: "Add a note", kind: "textarea", required: true, rows: 3 },
        { name: "pinned", label: "Pin to the top", kind: "checkbox" },
      ]}
      submitLabel="Add note"
      pendingLabel="Adding…"
      resetOnSuccess
      testId="internal-note-form"
    />
  );
}

export function NoteRowActions({ id, pinned }: { id: string; pinned: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-disabled={pending || undefined}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("portal", "admin");
            fd.set("id", id);
            fd.set("pinned", pinned ? "false" : "true");
            const r = await updateInternalNoteAction(null, fd);
            if (r.ok) router.refresh();
            else toast.error(r.error);
          })
        }
      >
        {pinned ? "Unpin" : "Pin"}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm">
            Delete
          </Button>
        }
        title="Delete this note?"
        description="The note is removed for everyone on the team."
        confirmLabel="Delete note"
        variant="destructive"
        onConfirm={() => deleteInternalNoteAction({ portal: "admin", id })}
        onSuccess={() => router.refresh()}
      />
    </span>
  );
}
