"use client";

import { useActionState, useRef, useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { staffReplyToTicketAction } from "@/modules/operations/admin-actions";
import { replyToMyTicketAction } from "@/modules/operations/actions";

/**
 * Reply box under a support conversation.
 *  - requester: plain reply with attachments.
 *  - staff: adds "internal note" (never shown to the requester) and an optional status change.
 */
export function TicketReplyForm({
  ticketId,
  mode,
  statusOptions,
  organizationId,
}: {
  ticketId: string;
  mode: "requester" | "staff";
  statusOptions?: SelectOption[];
  organizationId?: string;
}) {
  const [internal, setInternal] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(mode === "staff" ? staffReplyToTicketAction : replyToMyTicketAction, null);
  useActionToast(state, {
    onSuccess: () => {
      formRef.current?.reset();
      setInternal(false);
      setResetKey((k) => k + 1);
    },
  });

  return (
    <form ref={formRef} action={formAction} className="space-y-4" noValidate data-testid="ticket-reply-form">
      <FormErrorAlert state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField label={internal ? "Internal note" : "Your reply"} name="body" required state={state} hint={internal ? "Only Venkat Sai staff can see internal notes." : undefined}>
        <Textarea rows={4} maxLength={10000} className={internal ? "border-dashed border-gold" : undefined} />
      </FormField>
      <FileUpload
        key={resetKey}
        purpose="ticket_attachment"
        name="attachmentFileIds"
        multiple
        maxFiles={5}
        organizationId={organizationId}
        label="Attachments (optional)"
        onUploadingChange={setUploading}
      />
      {mode === "staff" ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id={`internal-${ticketId}`} name="internal" checked={internal} onCheckedChange={(v) => setInternal(v === true)} value="on" />
            <Label htmlFor={`internal-${ticketId}`}>Internal note (not sent to the requester)</Label>
          </div>
          {!internal && statusOptions?.length ? (
            <FormField label="Then set status to" name="status" optional state={state} className="sm:w-64">
              {(field) => <SimpleSelect {...field} options={statusOptions} allowClear clearLabel="Keep automatic status" placeholder="Keep automatic status" />}
            </FormField>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Sending…" disabled={uploading}>
          {mode === "staff" ? (internal ? "Add internal note" : "Send reply") : "Send reply"}
        </SubmitButton>
      </div>
    </form>
  );
}
