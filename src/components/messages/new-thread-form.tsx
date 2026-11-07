"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { SearchableSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createThreadAction } from "@/modules/operations/actions";

type ActorPortal = "admin" | "employer" | "recruiter" | "institution";

/**
 * Start a conversation.
 *  - Organisation portals: subject + message; the Venkat Sai team is added automatically.
 *  - Command Centre: choose an organisation and/or people (candidates or organisation members). People are
 *    found with `searchPeople` (a staff-only Server Action).
 */
export function NewThreadForm({
  portal,
  basePath,
  organizationId,
  organizationOptions,
  searchPeople,
  defaultOrganizationId,
}: {
  portal: ActorPortal;
  basePath: string;
  /** Uploading organisation (organisation portals). */
  organizationId?: string;
  organizationOptions?: SelectOption[];
  searchPeople?: (query: string) => Promise<SelectOption[]>;
  defaultOrganizationId?: string;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [state, formAction] = useActionState(createThreadAction, null);
  useActionToast(state, {
    successMessage: "Conversation started",
    onSuccess: (s) => {
      const id = (s.data as { id?: string } | undefined)?.id;
      if (id) router.push(`${basePath}/${id}`);
    },
  });
  const isStaff = portal === "admin";

  return (
    <form action={formAction} className="space-y-5" noValidate data-testid="new-thread-form">
      <FormErrorAlert state={state} fieldLabels={{ subject: "Subject", message: "Message", organizationId: "Organisation", participantUserIds: "People" }} />
      <input type="hidden" name="portal" value={portal} />
      <input type="hidden" name="contextType" value="general" />
      {isStaff ? (
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Organisation" name="organizationId" optional state={state} hint="Its members with messaging access can read and reply.">
            {(field) => (
              <SearchableSelect
                {...field}
                options={organizationOptions ?? []}
                defaultValue={defaultOrganizationId}
                allowClear
                clearLabel="No organisation"
                placeholder="Choose an organisation"
                searchPlaceholder="Search organisations"
                emptyText="No organisation found"
              />
            )}
          </FormField>
          <FormField label="People" name="participantUserIds" optional state={state} hint="Search by name, email or phone. Candidates can reply from the People Portal.">
            {(field) => (
              <MultiCombobox
                {...field}
                name="participantUserIds"
                loadOptions={(q) => (searchPeople ? searchPeople(q) : Promise.resolve([]))}
                placeholder="Add people"
                searchPlaceholder="Name, email or phone"
                emptyText="Nobody found"
                typeToSearchText="Type at least 3 characters"
                minQueryLength={3}
                maxSelected={20}
              />
            )}
          </FormField>
        </div>
      ) : null}
      <FormField label="Subject" name="subject" required state={state}>
        <Input maxLength={200} autoComplete="off" />
      </FormField>
      <FormField label="Message" name="message" required state={state} hint="Do not share passwords, one-time codes or bank details.">
        <Textarea rows={6} maxLength={10000} />
      </FormField>
      <FileUpload purpose="message_attachment" name="attachmentFileIds" multiple maxFiles={5} organizationId={organizationId} label="Attachments (optional)" onUploadingChange={setUploading} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Starting…" disabled={uploading}>
          Start conversation
        </SubmitButton>
      </div>
    </form>
  );
}
