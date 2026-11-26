"use client";

import { useEffect, useRef, useState } from "react";

import { useEmployerForm } from "@/components/employer/use-form-action";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";

import { inviteTeamMemberAction } from "../actions";

export function InviteForm({ roleOptions, seatsNote }: { roleOptions: SelectOption[]; seatsNote?: string | null }) {
  const { state, pending, onSubmit } = useEmployerForm(inviteTeamMemberAction);
  const [formKey, setFormKey] = useState(0);
  const last = useRef(state);
  useActionToast(state);
  useEffect(() => {
    if (state !== last.current && state?.ok) setFormKey((k) => k + 1);
    last.current = state;
  }, [state]);

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Invite a team member">
      <FormErrorAlert state={state} fieldLabels={{ email: "Email address", roleId: "Role" }} />
      {/* Top-aligned so the hint or an error under one field never pushes the inputs out of line. The button's top
          margin is one label line (text-sm, leading-snug) plus the field's gap-1.5. */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-start">
        <FormField label="Email address" name="email" required state={state} hint="They must sign in with this address to accept.">
          <Input type="email" autoComplete="off" maxLength={254} placeholder="name@company.com" />
        </FormField>
        <FormField label="Role" name="roleId" required state={state}>
          <SimpleSelect options={roleOptions} defaultValue={roleOptions.find((r) => r.label === "Recruiter")?.value} placeholder="Choose a role" />
        </FormField>
        <SubmitButton pending={pending} pendingLabel="Sending…" className="sm:mt-[calc(0.875rem*1.375+0.375rem)]">
          Send invitation
        </SubmitButton>
      </div>
      {/* Success is announced by the toast (useActionToast); a second live region here would repeat it. */}
      {seatsNote ? <p className="text-sm text-muted-foreground">{seatsNote}</p> : null}
    </form>
  );
}
