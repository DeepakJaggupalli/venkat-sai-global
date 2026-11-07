"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelMyDataRequestAction } from "@/modules/privacy/actions";

export function CancelRequestButton({ id, code }: { id: string; code: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          Cancel<span className="sr-only"> request {code}</span>
        </Button>
      }
      title={`Cancel request ${code}?`}
      description="We will stop working on it. You can make a new request at any time."
      confirmLabel="Cancel request"
      cancelLabel="Keep request"
      onConfirm={cancelMyDataRequestAction.bind(null, { id })}
    />
  );
}
