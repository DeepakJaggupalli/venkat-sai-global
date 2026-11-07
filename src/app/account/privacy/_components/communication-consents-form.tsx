"use client";

import { useActionState } from "react";

import { FormErrorAlert, SubmitButton, useActionToast } from "@/components/shared/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { saveCommunicationConsentsAction } from "../actions";

type Item = { purpose: string; label: string; description: string; granted: boolean; disabledReason: string | null };

/** Switches for communication consents; never pre-ticked (they show the person's latest recorded choice). */
export function CommunicationConsentsForm({ items }: { items: Item[] }) {
  const [state, formAction] = useActionState(saveCommunicationConsentsAction, null);
  useActionToast(state);
  return (
    <form action={formAction} className="space-y-4" data-testid="communication-consents-form">
      <FormErrorAlert state={state} />
      <input type="hidden" name="current" value={items.filter((i) => i.granted).map((i) => i.purpose).join(",")} />
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.purpose} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <Label htmlFor={`consent-${item.purpose}`} className="text-sm font-medium text-foreground">
                {item.label}
              </Label>
              <p id={`consent-${item.purpose}-hint`} className="text-sm text-muted-foreground">
                {item.description}
                {item.disabledReason ? ` ${item.disabledReason}` : ""}
              </p>
            </div>
            <Switch
              id={`consent-${item.purpose}`}
              name={item.purpose}
              value="on"
              defaultChecked={item.granted}
              disabled={Boolean(item.disabledReason) && !item.granted}
              aria-describedby={`consent-${item.purpose}-hint`}
            />
          </li>
        ))}
      </ul>
      <SubmitButton pendingLabel="Saving…" variant="outline">
        Save choices
      </SubmitButton>
    </form>
  );
}
