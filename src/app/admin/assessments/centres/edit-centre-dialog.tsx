"use client";

import { useState } from "react";

import { StaffForm, type StaffFieldSpec } from "@/app/admin/pipeline/_shared/staff-form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult, ActionState } from "@/lib/actions";

/** Edit an assessment centre in a dialog (bottom sheet on phones). */
export function EditCentreDialog<T>({
  name,
  action,
  centreId,
  fields,
}: {
  name: string;
  action: (prev: ActionState<T>, fd: FormData) => Promise<ActionResult<T>>;
  centreId: string;
  fields: StaffFieldSpec[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={
        <Button variant="outline" size="sm">
          Edit
        </Button>
      }
      title={`Edit ${name}`}
    >
      <StaffForm action={action} hidden={{ centreId }} fields={fields} columns={2} submitLabel="Save centre" onSuccess={() => setOpen(false)} />
    </ResponsiveDialog>
  );
}
