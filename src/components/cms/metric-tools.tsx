"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCustomMetricAction, refreshLiveMetricsAction } from "@/modules/content/actions";

export function RefreshLiveMetricsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await refreshLiveMetricsAction({});
          if (r.ok) {
            toast.success(r.message ?? "Recalculated.");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
      {pending ? "Recalculating…" : "Recalculate live counts"}
    </Button>
  );
}

export function CreateCustomMetricButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createCustomMetricAction, null);
  useActionToast(state, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button">
          <Plus aria-hidden />
          Add a custom figure
        </Button>
      }
      title="Add a custom figure"
      description="For a figure the platform cannot count itself, such as welders trained at the workshop since a given year. It starts hidden and needs evidence and approval before it is shown."
    >
      <form action={formAction} noValidate className="space-y-4">
        <FormErrorAlert state={state} />
        <FormField label="Key" name="key" required state={state} hint="custom_ followed by lower-case letters, numbers or underscores, for example custom_welders_trained.">
          <Input defaultValue="custom_" maxLength={62} spellCheck={false} autoCapitalize="none" />
        </FormField>
        <FormField label="Label" name="label" required state={state}>
          <Input maxLength={80} />
        </FormField>
        <FormField label="Definition" name="definition" optional state={state} hint="Exactly what is counted, so visitors understand the number.">
          <Textarea rows={3} maxLength={600} />
        </FormField>
        <SubmitButton pendingLabel="Creating…">Create</SubmitButton>
      </form>
    </ResponsiveDialog>
  );
}
