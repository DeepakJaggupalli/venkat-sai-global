"use client";

import { Power, PowerOff, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteFunnelAction, setFunnelActiveAction } from "@/modules/analytics/actions";

/** Activate / deactivate / delete a funnel (analytics.configure is re-checked by the module actions). */
export function FunnelAdminActions({ id, name, isActive, isDefault }: { id: string; name: string; isActive: boolean; isDefault: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm">
            {isActive ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
            {isActive ? "Deactivate" : "Activate"}
            <span className="sr-only"> {name}</span>
          </Button>
        }
        title={isActive ? `Deactivate ${name}?` : `Activate ${name}?`}
        description={isActive ? "It stays saved and can be activated again. Its numbers are not deleted." : "It will appear in the funnel list again."}
        confirmLabel={isActive ? "Deactivate" : "Activate"}
        onConfirm={() => setFunnelActiveAction({ id, isActive: !isActive })}
      />
      {isDefault ? null : (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <Trash2 aria-hidden="true" />
              Delete<span className="sr-only"> {name}</span>
            </Button>
          }
          title={`Delete ${name}?`}
          description="The funnel definition is removed. Recorded events are not affected."
          confirmLabel="Delete funnel"
          variant="destructive"
          onConfirm={() => deleteFunnelAction({ id })}
        />
      )}
    </div>
  );
}
