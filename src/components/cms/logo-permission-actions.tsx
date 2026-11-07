"use client";

import { BadgeCheck, Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LogoPermissionStatus } from "@/db/schema";
import { approveLogoPermissionAction, revokeLogoPermissionAction } from "@/modules/content/actions";

/** Approve a pending permission or revoke an approved one (revocation takes linked logos offline). */
export function LogoPermissionActions({ id, status, linkedCount, hasEvidence }: { id: string; status: LogoPermissionStatus; linkedCount: number; hasEvidence: boolean }) {
  const router = useRouter();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [state, formAction] = useActionState(revokeLogoPermissionAction, null);
  useActionToast(state, {
    onSuccess: () => {
      setRevokeOpen(false);
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-2">
      {status === "pending" && (
        <>
          {!hasEvidence && <p className="text-sm text-warning-strong">Add an evidence file or reference before approving.</p>}
          <ConfirmDialog
            trigger={
              <Button type="button" className="w-full" disabled={!hasEvidence}>
                <BadgeCheck aria-hidden />
                Approve permission
              </Button>
            }
            title="Approve this logo permission?"
            description="Confirm that you checked the evidence and that it covers the selected places. Your name is recorded with the approval."
            confirmLabel="Approve"
            onConfirm={() => approveLogoPermissionAction({ id })}
            onSuccess={() => router.refresh()}
          />
        </>
      )}
      {(status === "approved" || status === "pending") && (
        <ResponsiveDialog
          open={revokeOpen}
          onOpenChange={setRevokeOpen}
          trigger={
            <Button type="button" variant="outline" className="w-full text-danger-strong hover:text-danger-strong">
              <Ban aria-hidden />
              Revoke
            </Button>
          }
          title="Revoke this permission?"
          description={linkedCount > 0 ? `${linkedCount} linked ${linkedCount === 1 ? "logo is" : "logos are"} taken off the website immediately.` : "No logos are linked to it."}
          size="sm"
        >
          <form action={formAction} noValidate className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <FormErrorAlert state={state} />
            <FormField label="Reason" name="reason" required state={state} hint="For example “Organisation withdrew permission by email on 3 November”.">
              <Textarea rows={3} maxLength={500} />
            </FormField>
            <SubmitButton pendingLabel="Revoking…" variant="destructive">
              Revoke permission
            </SubmitButton>
          </form>
        </ResponsiveDialog>
      )}
    </div>
  );
}
