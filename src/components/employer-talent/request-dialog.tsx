"use client";

import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactElement } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions";
import { track } from "@/modules/analytics/client";
import { createThreadAction } from "@/modules/operations/actions";

export type RequestKind = "interview" | "assessment" | "information";

const COPY: Record<RequestKind, { label: string; subject: string; intro: string; description: string }> = {
  interview: {
    label: "Request an interview",
    subject: "Interview request",
    intro: "We would like to interview this candidate. Please help us arrange it.",
    description: "Venkat Sai contacts the candidate for you and confirms a time. The candidate is never charged.",
  },
  assessment: {
    label: "Request a trade test",
    subject: "Trade test / assessment request",
    intro: "We would like this candidate to take a Venkat Sai trade test before we decide.",
    description: "Venkat Sai arranges the assessment. Assessment costs are never passed on to the candidate.",
  },
  information: {
    label: "Request more information",
    subject: "Request for more information",
    intro: "We would like more information about this candidate.",
    description: "Ask Venkat Sai about experience, documents or availability. Replies arrive in Messages.",
  },
};

/**
 * Sends a request about a candidate to the Venkat Sai team as a message thread (operations module).
 * Candidates are not thread participants; Venkat Sai contacts them with their consent.
 */
export function RequestDialog({
  kind,
  candidateLabel,
  profilePath,
  applicationId,
  trigger,
}: {
  kind: RequestKind;
  candidateLabel: string;
  profilePath: string;
  applicationId?: string;
  trigger?: ReactElement;
}) {
  const copy = COPY[kind];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState<{ id: string }>>(null);
  const [pending, startTransition] = useTransition();
  const formId = useId();

  // Submitting through onSubmit keeps what was typed when the server returns field errors.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createThreadAction(null, formData);
      setState(result);
      if (!result.ok) return;
      setOpen(false);
      track("form_submitted", { form: `employer_candidate_request_${kind}` });
      if (result.data?.id) router.push(`/employer/messages/${result.data.id}`);
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        trigger ?? (
          <Button type="button" variant="outline" size="sm" className="justify-start">
            <MessageSquarePlus aria-hidden className="size-4" />
            {copy.label}
          </Button>
        )
      }
      title={copy.label}
      description={copy.description}
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={state} />
        <input type="hidden" name="portal" value="employer" />
        <input type="hidden" name="contextType" value={applicationId ? "application" : "general"} />
        {applicationId ? <input type="hidden" name="contextId" value={applicationId} /> : null}
        <FormField label="Subject" name="subject" required state={state}>
          <Input defaultValue={`${copy.subject}: ${candidateLabel}`} maxLength={200} />
        </FormField>
        <FormField label="Message" name="message" required state={state} hint="Include the role, location and any dates that suit you.">
          <Textarea rows={6} maxLength={10000} defaultValue={`${copy.intro}\n\nCandidate profile: ${profilePath}\n\nRole and details:\n`} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingLabel="Sending…">
            Send request
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
