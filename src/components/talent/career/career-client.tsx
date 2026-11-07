"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import type { ActionResult, ActionState } from "@/lib/actions";

import { useTalentForm, useTalentMessages } from "../use-talent-action";

type RequestAction = (prev: ActionState<{ id: string | null; code: string | null }>, formData: FormData) => Promise<ActionResult<{ id: string | null; code: string | null }>>;

/** Resume review / career counselling / interview preparation request (becomes a support ticket). */
export function CareerRequestForm({ action, service }: { action: RequestAction; service: string }) {
  const ta = useT("talent-account");
  const { t } = useTalentMessages();
  const [created, setCreated] = useState<{ id: string | null; code: string | null } | null>(null);
  const [state, formAction] = useTalentForm(action, { successMessage: ta("career.request.sent"), onSuccess: (r) => setCreated(r.ok ? (r.data ?? null) : null) });
  if (created) {
    return (
      <div role="status" className="space-y-2 rounded-lg bg-success-soft p-4 text-sm">
        <p className="font-medium text-success-strong">{ta("career.request.sent")}</p>
        {created.code ? <p>{ta("career.request.reference", { code: created.code })}</p> : null}
        <Link href={created.id ? `/talent/support/${created.id}` : "/talent/support"} className="font-medium text-teal-strong underline underline-offset-2">
          {ta("career.request.follow")}
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-4" noValidate data-testid={`career-request-${service}`}>
      <FormErrorAlert state={state} />
      <input type="hidden" name="service" value={service} />
      <FormField label={ta("career.request.message")} name="message" required state={state} hint={ta(`career.request.${service}.hint`)}>
        <Textarea rows={4} maxLength={4000} />
      </FormField>
      <FormField label={ta("career.request.times")} name="preferredTimes" state={state}>
        <Input maxLength={300} placeholder={ta("career.request.timesPlaceholder")} />
      </FormField>
      <SubmitButton pendingLabel={t("form.saving")}>{ta("career.request.submit")}</SubmitButton>
    </form>
  );
}

export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden="true" />
      {label}
    </Button>
  );
}
