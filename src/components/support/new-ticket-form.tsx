"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";
import { createSupportTicketAction } from "@/modules/operations/actions";

export type NewTicketFormProps = {
  portal: "talent" | "employer" | "recruiter" | "institution";
  /** Where the detail page lives, e.g. "/employer/support". */
  basePath: string;
  categories: SelectOption[];
  grievanceTypes: SelectOption[];
  priorities: SelectOption[];
  defaultCategory?: string;
  defaultSubject?: string;
  relatedType?: string;
  relatedId?: string;
  /** Organisation the attachments are uploaded for (organisation portals). */
  organizationId?: string;
};

/**
 * Raise a support request: category, priority (requesters cannot pick "urgent"), subject, description and up
 * to 5 attachments. Choosing "Grievance (formal)" asks for the grievance type (statutory timelines apply).
 * On success it opens the new request.
 */
export function NewTicketForm({ portal, basePath, categories, grievanceTypes, priorities, defaultCategory, defaultSubject, relatedType, relatedId, organizationId }: NewTicketFormProps) {
  const router = useRouter();
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [uploading, setUploading] = useState(false);
  const [state, formAction] = useActionState(createSupportTicketAction, null);
  useActionToast(state, {
    onSuccess: (s) => {
      const id = (s.data as { id?: string } | undefined)?.id;
      track("form_submitted", { formId: "support_ticket", portal, category });
      if (id) router.push(`${basePath}/${id}`);
    },
  });

  return (
    <form action={formAction} className="space-y-5" noValidate data-testid="new-ticket-form">
      <FormErrorAlert state={state} fieldLabels={{ category: "Category", subject: "Subject", message: "Description", grievanceType: "Grievance type", attachmentFileIds: "Attachments" }} />
      <input type="hidden" name="portal" value={portal} />
      {relatedType && relatedId ? (
        <>
          <input type="hidden" name="relatedType" value={relatedType} />
          <input type="hidden" name="relatedId" value={relatedId} />
        </>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="What do you need help with?" name="category" required state={state}>
          {(field) => <SimpleSelect {...field} options={categories} value={category} onValueChange={setCategory} placeholder="Choose a category" />}
        </FormField>
        <FormField label="How urgent is it?" name="priority" state={state} hint="Our team can raise the priority if needed.">
          {(field) => <SimpleSelect {...field} options={priorities} defaultValue="normal" />}
        </FormField>
      </div>
      {category === "grievance" ? (
        <FormField
          label="Type of grievance"
          name="grievanceType"
          required
          state={state}
          hint="Formal grievances are logged in our grievance register and answered within the timelines published on our grievance page."
        >
          {(field) => <SimpleSelect {...field} options={grievanceTypes} placeholder="Choose a type" />}
        </FormField>
      ) : null}
      <FormField label="Subject" name="subject" required state={state}>
        <Input defaultValue={defaultSubject} maxLength={200} autoComplete="off" />
      </FormField>
      <FormField label="Describe the issue" name="message" required state={state} hint="Include what you tried and any reference numbers. Do not share passwords or one-time codes.">
        <Textarea rows={6} maxLength={10000} />
      </FormField>
      <FileUpload
        purpose="ticket_attachment"
        name="attachmentFileIds"
        multiple
        maxFiles={5}
        organizationId={organizationId}
        label="Attachments (optional)"
        description="Screenshots or documents that help explain the issue. Up to 5 files."
        invalid={state?.ok === false && Boolean(state.fieldErrors?.attachmentFileIds)}
        onUploadingChange={setUploading}
      />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Sending…" disabled={uploading}>
          Send request
        </SubmitButton>
      </div>
    </form>
  );
}
