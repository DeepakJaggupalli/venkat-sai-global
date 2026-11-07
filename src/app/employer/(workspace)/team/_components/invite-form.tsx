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
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
        <FormField label="Email address" name="email" required state={state} hint="They must sign in with this address to accept.">
          <Input type="email" autoComplete="off" maxLength={254} placeholder="name@company.com" />
        </FormField>
        <FormField label="Role" name="roleId" required state={state}>
          <SimpleSelect options={roleOptions} defaultValue={roleOptions.find((r) => r.label === "Recruiter")?.value} placeholder="Choose a role" />
        </FormField>
        <SubmitButton pending={pending} pendingLabel="Sending…" className="sm:mb-[1.6rem]">
          Send invitation
        </SubmitButton>
      </div>
      {seatsNote ? <p className="text-sm text-muted-foreground">{seatsNote}</p> : null}
      <p className="sr-only" aria-live="polite">
        {state?.ok ? state.message : ""}
      </p>
    </form>
  );
}
