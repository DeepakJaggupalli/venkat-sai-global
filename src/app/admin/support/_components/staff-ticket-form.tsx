"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTicketForRequesterAction } from "@/modules/operations/admin-actions";

/** Log a request received by phone, email, WhatsApp or in person. */
export function StaffTicketForm({ channels, categories, priorities, grievanceTypes }: { channels: SelectOption[]; categories: SelectOption[]; priorities: SelectOption[]; grievanceTypes: SelectOption[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [state, formAction] = useActionState(createTicketForRequesterAction, null);
  useActionToast(state, {
    onSuccess: (s) => {
      const id = (s.data as { ticketId?: string; id?: string } | undefined);
      const target = id?.id ?? id?.ticketId;
      router.push(target ? `/admin/support/${target}` : "/admin/support");
    },
  });
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormErrorAlert state={state} fieldLabels={{ requesterEmail: "Email", requesterPhone: "Phone", category: "Category", subject: "Subject", message: "Message" }} />
      <fieldset className="grid gap-5 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold text-foreground">Requester</legend>
        <FormField label="Name" name="requesterName" optional state={state}>
          <Input maxLength={120} autoComplete="off" />
        </FormField>
        <FormField label="Email" name="requesterEmail" optional state={state} hint="An email or phone number is required.">
          <Input type="email" autoComplete="off" />
        </FormField>
        <FormField label="Phone" name="requesterPhone" optional state={state}>
          <Input type="tel" autoComplete="off" />
        </FormField>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Received by" name="channel" required state={state}>
          {(field) => <SimpleSelect {...field} options={channels} defaultValue="phone" />}
        </FormField>
        <FormField label="Category" name="category" required state={state}>
          {(field) => <SimpleSelect {...field} options={categories} value={category} onValueChange={setCategory} placeholder="Choose a category" />}
        </FormField>
        <FormField label="Priority" name="priority" required state={state}>
          {(field) => <SimpleSelect {...field} options={priorities} defaultValue="normal" />}
        </FormField>
      </div>
      {category === "grievance" ? (
        <FormField label="Grievance type" name="grievanceType" required state={state}>
          {(field) => <SimpleSelect {...field} options={grievanceTypes} placeholder="Choose a type" />}
        </FormField>
      ) : null}
      <FormField label="Subject" name="subject" required state={state}>
        <Input maxLength={200} />
      </FormField>
      <FormField label="What the requester said" name="message" required state={state}>
        <Textarea rows={6} maxLength={10000} />
      </FormField>
      <div className="flex items-center gap-2">
        <Checkbox id="assignToSelf" name="assignToSelf" value="on" defaultChecked />
        <Label htmlFor="assignToSelf">Assign to me</Label>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Logging…">Log request</SubmitButton>
      </div>
    </form>
  );
}
