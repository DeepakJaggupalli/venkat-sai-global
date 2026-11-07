"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import {
  assignDataRequestAction,
  completeDataRequestAction,
  queueAccountErasureAction,
  queueDataExportAction,
  rejectDataRequestAction,
  requestIdentityVerificationAction,
  startDataRequestAction,
  verifyDataRequestIdentityAction,
} from "@/modules/privacy/actions";

function useRun() {
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<ActionResult<unknown>>) =>
      start(async () => {
        const r = await fn();
        if (r.ok) toast.success(r.message ?? "Saved");
        else toast.error(r.error);
      }),
  };
}

export function AssignRequest({ id, handlerId, staffOptions }: { id: string; handlerId: string | null; staffOptions: SelectOption[] }) {
  const { pending, run } = useRun();
  return (
    <div className="space-y-1.5" aria-busy={pending || undefined}>
      <Label htmlFor={`handler-${id}`}>Handled by</Label>
      <SimpleSelect
        id={`handler-${id}`}
        name="handler"
        options={staffOptions}
        defaultValue={handlerId ?? undefined}
        allowClear
        clearLabel="Unassigned"
        placeholder="Unassigned"
        onValueChange={(v) => run(() => assignDataRequestAction({ id, assigneeUserId: v || undefined }))}
      />
    </div>
  );
}

export function VerifyIdentityForm({ id, canAsk }: { id: string; canAsk: boolean }) {
  const { pending, run } = useRun();
  const [state, formAction] = useActionState(verifyDataRequestIdentityAction, null);
  useActionToast(state);
  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3" noValidate>
        <FormErrorAlert state={state} />
        <input type="hidden" name="id" value={id} />
        <FormField label="How did you verify the requester's identity?" name="note" required state={state} hint="For example: one-time code to the registered phone, or matching ID document. Kept in the audit trail.">
          <Textarea rows={3} maxLength={1000} />
        </FormField>
        <SubmitButton pendingLabel="Confirming…">Confirm identity and start</SubmitButton>
      </form>
      {canAsk ? (
        <Button type="button" variant="outline" size="sm" aria-disabled={pending || undefined} onClick={() => run(() => requestIdentityVerificationAction({ id }))}>
          Mark as waiting for identity proof
        </Button>
      ) : null}
    </div>
  );
}

export function StartButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button type="button" aria-disabled={pending || undefined} onClick={() => run(() => startDataRequestAction({ id }))}>
      Start processing
    </Button>
  );
}

export function GenerateExportButton({ id }: { id: string }) {
  return (
    <ConfirmDialog
      trigger={<Button type="button">Generate data export</Button>}
      title="Generate the export?"
      description="A JSON file of the person's data is created in the background, stored privately for their account only, and they are notified. The request then completes automatically."
      confirmLabel="Generate export"
      onConfirm={queueDataExportAction.bind(null, { id })}
    />
  );
}

export function EraseAccountForm({ id, defaultExceptions }: { id: string; defaultExceptions: string }) {
  const [state, formAction] = useActionState(queueAccountErasureAction, null);
  useActionToast(state);
  return (
    <form action={formAction} className="space-y-4" noValidate data-testid="erase-account-form">
      <FormErrorAlert state={state} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">
        This closes the account, signs it out everywhere, anonymises personal fields, deletes profile sections and uploaded files without a retention obligation and erases analytics data. It cannot be undone.
      </p>
      <FormField label="Records kept and why (shown in the request record)" name="retentionExceptions" optional state={state}>
        <Textarea rows={6} maxLength={4000} defaultValue={defaultExceptions} />
      </FormField>
      <FormField label="Type ERASE to confirm" name="confirm" required state={state}>
        <Input autoComplete="off" className="max-w-40" />
      </FormField>
      <SubmitButton variant="destructive" pendingLabel="Queuing…">
        Erase account
      </SubmitButton>
    </form>
  );
}

export function CompleteForm({ id, hint }: { id: string; hint?: string }) {
  const [state, formAction] = useActionState(completeDataRequestAction, null);
  useActionToast(state);
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormErrorAlert state={state} />
      <input type="hidden" name="id" value={id} />
      <FormField label="Resolution (sent to the requester)" name="resolution" required state={state} hint={hint}>
        <Textarea rows={4} maxLength={4000} />
      </FormField>
      <FormField label="Records kept and why" name="retentionExceptions" optional state={state}>
        <Textarea rows={2} maxLength={4000} />
      </FormField>
      <SubmitButton pendingLabel="Completing…">Complete request</SubmitButton>
    </form>
  );
}

export function RejectForm({ id }: { id: string }) {
  const [state, formAction] = useActionState(rejectDataRequestAction, null);
  useActionToast(state);
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormErrorAlert state={state} />
      <input type="hidden" name="id" value={id} />
      <FormField label="Reason (sent to the requester)" name="reason" required state={state} hint="Explain why, and how they can raise a grievance if they disagree.">
        <Textarea rows={3} maxLength={4000} />
      </FormField>
      <SubmitButton variant="outline" pendingLabel="Declining…">
        Decline request
      </SubmitButton>
    </form>
  );
}
