"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ActionResult, ActionState } from "@/lib/actions";

type FormAction = (prev: ActionState<undefined>, formData: FormData) => Promise<ActionResult<undefined>>;

/**
 * Daily backup email settings: one big switch row (the whole row is the tap target) and the address, which may be
 * left blank to use the business inbox. Saved through saveBackupSettingsAction (Super Admin, audited).
 */
export function BackupEmailSettingsForm({ action, dailyEmail, emailTo, businessInbox }: { action: FormAction; dailyEmail: boolean; emailTo: string; businessInbox: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState<undefined>, FormData>(action, null);
  useActionToast(state, { onSuccess: () => router.refresh() });

  return (
    <form action={formAction} noValidate className="space-y-4" data-testid="backup-settings-form">
      <FormErrorAlert state={state} />
      <label htmlFor="backup-daily-email" className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-teal/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <Checkbox id="backup-daily-email" name="dailyEmail" value="true" defaultChecked={dailyEmail} className="mt-0.5 size-5" />
        <span className="grid gap-1">
          <span className="font-medium text-foreground">Email a backup every day</span>
          <span className="text-sm text-muted-foreground">Sent every morning after 5:30 am. Passport numbers in the email show only the last 4 digits.</span>
        </span>
      </label>
      <FormField
        label="Send it to"
        name="emailTo"
        optional
        state={state}
        hint={businessInbox ? `Leave it blank to use the business inbox (${businessInbox}).` : "No business inbox is set in Settings, so type an address here."}
      >
        {(field) => (
          <Input
            {...field}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            defaultValue={emailTo}
            placeholder={businessInbox || "owner@example.com"}
            className="h-11 text-base md:text-sm"
          />
        )}
      </FormField>
      <SubmitButton pendingLabel="Saving…" className="h-11 w-full rounded-full sm:w-auto">
        Save
      </SubmitButton>
    </form>
  );
}

/** "Email a backup now": the same email as the daily one, at once (to check that backup emails arrive). */
export function EmailBackupNowForm({ action, disabledReason }: { action: FormAction; disabledReason: string | null }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState<undefined>, FormData>(action, null);
  useActionToast(state, { onSuccess: () => router.refresh() });

  return (
    <form action={formAction} className="space-y-3" data-testid="backup-email-now-form">
      <FormErrorAlert state={state} />
      <SubmitButton variant="outline" pendingLabel="Sending…" disabled={Boolean(disabledReason)} className="h-11 w-full rounded-full sm:w-auto">
        <Send aria-hidden="true" />
        Email a backup now
      </SubmitButton>
      {disabledReason ? <p className="text-sm text-muted-foreground">{disabledReason}</p> : null}
    </form>
  );
}
