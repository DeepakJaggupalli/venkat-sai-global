"use client";

import { useState, type ReactNode } from "react";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult, ActionState } from "@/lib/actions";

import { StaffForm, type StaffFieldSpec } from "./staff-form";

/** A StaffForm inside a dialog (bottom sheet on phones) that closes on success. */
export function FormDialog<T>({
  triggerLabel,
  triggerVariant = "outline",
  icon,
  title,
  description,
  action,
  fields,
  hidden,
  submitLabel,
  successHref,
  size = "md",
  testId,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  icon?: ReactNode;
  title: string;
  description?: string;
  action: (prev: ActionState<T>, fd: FormData) => Promise<ActionResult<T>>;
  fields: StaffFieldSpec[];
  hidden?: Record<string, string | number | boolean | null | undefined>;
  submitLabel: string;
  successHref?: string;
  size?: "sm" | "md" | "lg";
  testId?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      size={size}
      trigger={
        <Button variant={triggerVariant} size="sm" data-testid={testId}>
          {icon}
          {triggerLabel}
        </Button>
      }
      title={title}
      description={description}
    >
      <StaffForm action={action} fields={fields} hidden={hidden} submitLabel={submitLabel} successHref={successHref} onSuccess={() => setOpen(false)}>
        {children}
      </StaffForm>
    </ResponsiveDialog>
  );
}
