"use client";

import { Bell, BellOff } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { setThreadMutedAction, setThreadStatusAction } from "@/modules/operations/actions";

import { DEFAULT_MESSAGES_LABELS, type MessagesLabels } from "./labels";

type ActorPortal = "admin" | "employer" | "recruiter" | "institution" | "talent";

/**
 * Mute / unmute for every participant; close for staff and organisation members; reopen for staff only
 * (the module enforces the same rules).
 */
export function ThreadControls({
  portal,
  threadId,
  isMuted,
  status,
  canClose,
  canReopen,
  labels = DEFAULT_MESSAGES_LABELS,
}: {
  portal: ActorPortal;
  threadId: string;
  isMuted: boolean | null;
  status: "open" | "closed";
  canClose: boolean;
  canReopen: boolean;
  labels?: MessagesLabels;
}) {
  const [pending, startTransition] = useTransition();

  const toggleMute = () =>
    startTransition(async () => {
      const result = await setThreadMutedAction({ portal, threadId, muted: !isMuted });
      if (result.ok) toast.success(result.message ?? (isMuted ? labels.unmute : labels.mute));
      else toast.error(result.error);
    });

  const reopen = () =>
    startTransition(async () => {
      const result = await setThreadStatusAction({ portal, threadId, status: "open" });
      if (result.ok) toast.success(result.message ?? labels.reopenConversation);
      else toast.error(result.error);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {isMuted !== null ? (
        <Button type="button" variant="outline" size="sm" onClick={toggleMute} aria-disabled={pending || undefined} aria-pressed={isMuted}>
          {isMuted ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
          {isMuted ? labels.unmute : labels.mute}
        </Button>
      ) : null}
      {status === "open" && canClose ? (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" size="sm">
              {labels.closeConversation}
            </Button>
          }
          title={labels.closeConfirmTitle}
          description={labels.closeConfirmDescription}
          confirmLabel={labels.closeConversation}
          onConfirm={setThreadStatusAction.bind(null, { portal, threadId, status: "closed" })}
        />
      ) : null}
      {status === "closed" && canReopen ? (
        <Button type="button" variant="outline" size="sm" onClick={reopen} aria-disabled={pending || undefined}>
          {labels.reopenConversation}
        </Button>
      ) : null}
    </div>
  );
}
