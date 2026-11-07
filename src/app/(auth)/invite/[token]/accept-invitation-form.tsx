"use client";

import { acceptInvitationAction } from "@/modules/organizations/member-actions";

import { FormAlert, SubmitButton, useFormAction } from "../../_components/form-kit";

/**
 * Accept button for an invitation. On success the action redirects to the organisation's portal;
 * on failure the reason is shown above the button and focus moves to it.
 */
export function AcceptInvitationForm({ token, organizationName }: { token: string; organizationName: string }) {
  const { state, pending, onSubmit, formRef, formAction } = useFormAction(acceptInvitationAction);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate aria-label={`Accept the invitation to join ${organizationName}`}>
      <input type="hidden" name="token" value={token} />
      <FormAlert state={state} />
      <SubmitButton pending={pending}>{pending ? "Joining…" : "Accept invitation"}</SubmitButton>
    </form>
  );
}
