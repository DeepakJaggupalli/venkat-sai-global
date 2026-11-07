"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addApplicationNoteAction, withdrawSubmissionAction } from "@/modules/recruitment/actions";

export function WithdrawSubmissionButton({ submissionId, candidateName }: { submissionId: string; candidateName: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Withdraw submission</Button>}
      title={`Withdraw ${candidateName}?`}
      description="Venkat Sai stops reviewing this submission. Any attribution it created is released, and it no longer counts towards the submission limit."
      confirmLabel="Withdraw"
      variant="destructive"
      onConfirm={async () => {
        const result = await withdrawSubmissionAction({ submissionId });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}

/** Note to Venkat Sai on the application (always staff_and_partner for partners; never shown to candidates). */
export function PartnerNoteForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get("body") ?? "").trim();
    if (!body) {
      setError("Write a note first.");
      return;
    }
    startTransition(async () => {
      const result = await addApplicationNoteAction({ portal: "recruiter", applicationId, body, visibility: "staff_and_partner" });
      if (result.ok) {
        setError(null);
        ref.current?.reset();
        toast.success(result.message ?? "Note added.");
        router.refresh();
      } else {
        setError(result.fieldErrors?.body?.[0] ?? result.error);
      }
    });
  }

  return (
    <form ref={ref} onSubmit={onSubmit} noValidate className="space-y-2">
      <Label htmlFor="partner-note">Add a note for Venkat Sai</Label>
      <Textarea id="partner-note" name="body" rows={3} maxLength={5000} aria-invalid={error ? true : undefined} aria-describedby={error ? "partner-note-error" : "partner-note-hint"} />
      <p id="partner-note-hint" className="text-xs text-muted-foreground">
        Visible to Venkat Sai staff only. Never shown to the candidate or the employer.
      </p>
      {error ? (
        <p id="partner-note-error" className="text-sm font-medium text-danger-strong" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="outline" aria-disabled={pending}>
          {pending ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
