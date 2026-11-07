"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelEmployerRequirementAction, submitEmployerRequirementDraftAction } from "@/modules/operations/actions";

/** Draft: edit / submit. Open: cancel with a reason. The operations module re-checks status and scope. */
export function RequirementActions({
  requirementId,
  isDraft,
  cancellable,
  submitBlockedReason,
}: {
  requirementId: string;
  isDraft: boolean;
  cancellable: boolean;
  submitBlockedReason: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isDraft ? (
        <>
          <ConfirmDialog
            trigger={<Button disabled={Boolean(submitBlockedReason)}>Submit to Venkat Sai</Button>}
            title="Submit this requirement?"
            description="Venkat Sai reviews it and gets back to you. You cannot edit it after submitting; ask your Venkat Sai contact for changes."
            confirmLabel="Submit requirement"
            onConfirm={() => submitEmployerRequirementDraftAction({ id: requirementId })}
          />
          <Button variant="outline" asChild>
            <Link href={`/employer/requirements/${requirementId}/edit`}>
              <Pencil aria-hidden="true" /> Edit draft
            </Link>
          </Button>
        </>
      ) : null}
      {cancellable ? (
        <ConfirmDialog
          trigger={<Button variant="ghost">Cancel requirement</Button>}
          title="Cancel this requirement?"
          description="Venkat Sai stops working on it. Candidates already in progress are handled with you individually."
          confirmLabel="Cancel requirement"
          cancelLabel="Keep requirement"
          variant="destructive"
          onConfirm={(formData?: FormData) => {
            const fd = formData ?? new FormData();
            fd.set("id", requirementId);
            return cancelEmployerRequirementAction(null, fd);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`cancel-reason-${requirementId}`}>Reason (required)</Label>
            <Textarea id={`cancel-reason-${requirementId}`} name="reason" rows={3} maxLength={1000} required />
          </div>
        </ConfirmDialog>
      ) : null}
      {isDraft && submitBlockedReason ? <p className="w-full text-sm text-muted-foreground">{submitBlockedReason}</p> : null}
    </div>
  );
}
