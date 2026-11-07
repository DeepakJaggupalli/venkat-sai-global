"use client";

import { Archive, CircleStop, RotateCcw, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { AnnouncementStatus } from "@/db/schema";
import { archiveAnnouncementAction, deleteAnnouncementAction, expireAnnouncementAction, publishAnnouncementAction, restoreAnnouncementAction } from "@/modules/content/actions";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

/** Publish / end / archive / restore / delete controls for one announcement. */
export function AnnouncementActions({ id, status, everPublished, startsInFuture }: { id: string; status: AnnouncementStatus; everPublished: boolean; startsInFuture: boolean }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  return (
    <div className="flex flex-col gap-2">
      {status === "draft" && (
        <ConfirmDialog
          trigger={
            <Button type="button" className="w-full">
              <Send aria-hidden />
              {startsInFuture ? "Schedule" : "Publish now"}
            </Button>
          }
          title={startsInFuture ? "Schedule this announcement?" : "Publish this announcement?"}
          description={startsInFuture ? "It appears automatically at the start time." : "It appears for the chosen audience straight away."}
          confirmLabel={startsInFuture ? "Schedule" : "Publish"}
          onConfirm={() => publishAnnouncementAction({ id })}
          onSuccess={refresh}
        />
      )}
      {(status === "published" || status === "scheduled") && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" className="w-full">
              <CircleStop aria-hidden />
              End now
            </Button>
          }
          title="End this announcement now?"
          description="It is removed from every placement immediately."
          confirmLabel="End now"
          onConfirm={() => expireAnnouncementAction({ id })}
          onSuccess={refresh}
        />
      )}
      {status !== "archived" && status !== "draft" && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" className="w-full justify-start">
              <Archive aria-hidden />
              Archive
            </Button>
          }
          title="Archive this announcement?"
          confirmLabel="Archive"
          onConfirm={() => archiveAnnouncementAction({ id })}
          onSuccess={refresh}
        />
      )}
      {(status === "archived" || status === "expired") && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" className="w-full justify-start">
              <RotateCcw aria-hidden />
              Restore as draft
            </Button>
          }
          title="Restore as a draft?"
          description="Edit the dates, then publish it again."
          confirmLabel="Restore"
          onConfirm={() => restoreAnnouncementAction({ id })}
          onSuccess={refresh}
        />
      )}
      {status === "draft" && !everPublished && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" className="w-full justify-start text-danger-strong hover:text-danger-strong">
              <Trash2 aria-hidden />
              Delete draft
            </Button>
          }
          title="Delete this draft?"
          description="It has never been published. This cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => deleteAnnouncementAction({ id })}
          onSuccess={() => router.push(CONTENT_ADMIN_PATHS.announcements)}
        />
      )}
    </div>
  );
}
