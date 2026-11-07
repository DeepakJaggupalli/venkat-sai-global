"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Textarea } from "@/components/ui/textarea";
import { markThreadReadAction, postThreadMessageAction } from "@/modules/operations/actions";

import { DEFAULT_MESSAGES_LABELS, type MessagesLabels } from "./labels";

type ActorPortal = "admin" | "employer" | "recruiter" | "institution" | "talent";

/** Reply box of a conversation: message + up to 5 attachments. Ctrl/⌘+Enter sends. */
export function MessageComposer({ portal, threadId, organizationId, labels = DEFAULT_MESSAGES_LABELS }: { portal: ActorPortal; threadId: string; organizationId?: string; labels?: MessagesLabels }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [state, formAction] = useActionState(postThreadMessageAction, null);
  useActionToast(state, {
    successMessage: labels.sent,
    onSuccess: () => {
      formRef.current?.reset();
      setResetKey((k) => k + 1);
    },
  });

  return (
    <form ref={formRef} action={formAction} className="space-y-3" noValidate data-testid="message-composer">
      <FormErrorAlert state={state} />
      <input type="hidden" name="portal" value={portal} />
      <input type="hidden" name="threadId" value={threadId} />
      <FormField label={labels.composerLabel} name="body" required state={state} hint={labels.composerHint}>
        <Textarea
          rows={4}
          maxLength={10000}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
      </FormField>
      <FileUpload key={resetKey} purpose="message_attachment" name="attachmentFileIds" multiple maxFiles={5} organizationId={organizationId} label={labels.composerAttachments} onUploadingChange={setUploading} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel={labels.sending} disabled={uploading}>
          {labels.send}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Moves the reader's position to now once the conversation has been shown (clears unread badges). */
export function MarkThreadRead({ portal, threadId, enabled }: { portal: ActorPortal; threadId: string; enabled: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) return;
    done.current = true;
    void markThreadReadAction({ portal, threadId }).catch(() => undefined);
  }, [enabled, portal, threadId]);
  return null;
}
