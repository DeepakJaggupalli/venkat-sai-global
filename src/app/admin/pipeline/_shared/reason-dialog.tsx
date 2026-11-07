"use client";

import { useRouter } from "next/navigation";
import { useId, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";


/**
 * A button that opens a confirmation dialog asking for a reason (and optionally one choice), then calls
 * a form Server Action (createFormAction) with the hidden fields + the dialog's fields. Used for
 * rejections, cancellations, revocations and sensitive reveals where a recorded reason is required.
 */
export function ReasonDialog<T>({
  action,
  hidden,
  triggerLabel,
  title,
  description,
  confirmLabel,
  reasonLabel = "Reason",
  reasonName = "reason",
  reasonRequired = true,
  reasonHint,
  choice,
  destructive = false,
  variant = "outline",
  icon,
  testId,
  onSuccessHref,
}: {
  action: (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;
  hidden: Record<string, string | number | boolean | null | undefined>;
  triggerLabel: string;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  reasonLabel?: string;
  reasonName?: string;
  reasonRequired?: boolean;
  reasonHint?: string;
  choice?: { name: string; label: string; options: SelectOption[]; defaultValue?: string; required?: boolean };
  destructive?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  icon?: ReactNode;
  testId?: string;
  onSuccessHref?: string;
}) {
  const router = useRouter();
  const id = useId();
  return (
    <ConfirmDialog
      trigger={
        <Button variant={variant} size="sm" data-testid={testId}>
          {icon}
          {triggerLabel}
        </Button>
      }
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant={destructive ? "destructive" : "default"}
      onConfirm={async (formData: FormData) => {
        for (const [k, v] of Object.entries(hidden)) {
          if (v !== undefined && v !== null) formData.set(k, String(v));
        }
        return action(null, formData);
      }}
      onSuccess={() => (onSuccessHref ? router.push(onSuccessHref) : router.refresh())}
    >
      <div className="space-y-3">
        {choice ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-choice`}>{choice.label}</Label>
            <SimpleSelect id={`${id}-choice`} name={choice.name} options={choice.options} defaultValue={choice.defaultValue} required={choice.required} />
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-reason`}>
            {reasonLabel}
            {reasonRequired ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
          </Label>
          <Textarea id={`${id}-reason`} name={reasonName} rows={3} required={reasonRequired} maxLength={1000} aria-describedby={reasonHint ? `${id}-hint` : undefined} />
          {reasonHint ? (
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {reasonHint}
            </p>
          ) : null}
        </div>
      </div>
    </ConfirmDialog>
  );
}
