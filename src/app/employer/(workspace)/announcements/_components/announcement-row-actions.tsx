"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { withdrawPartnerAnnouncementAction } from "@/modules/content/actions";

import { AnnouncementForm, type AnnouncementDefaults } from "./announcement-form";

export function AnnouncementRowActions({ announcement, editable, withdrawable }: { announcement: AnnouncementDefaults & { id: string; title: string }; editable: boolean; withdrawable: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="flex flex-wrap gap-2">
      {editable ? (
        <ResponsiveDialog
          open={open}
          onOpenChange={setOpen}
          size="lg"
          title={`Edit “${announcement.title}”`}
          trigger={
            <Button variant="outline" size="sm">
              Edit
            </Button>
          }
        >
          <AnnouncementForm defaults={announcement} onSaved={close} />
        </ResponsiveDialog>
      ) : null}
      {withdrawable ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              Withdraw
            </Button>
          }
          title="Withdraw this announcement?"
          description="It is removed from review or taken down if it is live."
          confirmLabel="Withdraw"
          variant="destructive"
          onConfirm={() => withdrawPartnerAnnouncementAction({ id: announcement.id, orgType: "employer" })}
        />
      ) : null}
    </div>
  );
}
