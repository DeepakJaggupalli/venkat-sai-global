"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addBatchInstructorAction, cancelBatchAction, removeBatchInstructorAction, setBatchStatusAction } from "@/modules/training/actions";

import { INSTRUCTOR_ROLE_LABELS, toOptions } from "./labels";
import { useInstitutionForm } from "./use-form-action";

type Transition = "open" | "pause" | "start" | "complete";

const TRANSITIONS: Record<string, { transition: Transition; label: string; title: string; description: string }[]> = {
  planned: [{ transition: "open", label: "Open enrolment", title: "Open this batch for enrolment?", description: "Learners can apply from the course page. The course must be published." }],
  open: [
    { transition: "start", label: "Start batch", title: "Start this batch?", description: "Confirmed learners move to in progress. Pending applications stay to be decided." },
    { transition: "pause", label: "Pause enrolment", title: "Pause enrolment?", description: "The batch goes back to planned and stops taking applications." },
  ],
  full: [{ transition: "start", label: "Start batch", title: "Start this batch?", description: "Confirmed learners move to in progress." }],
  in_progress: [{ transition: "complete", label: "Complete batch", title: "Mark this batch as completed?", description: "Do this after attendance and results are recorded. You can then issue certificates." }],
};

/** Status transitions and cancellation for a batch (the training service enforces the state machine). */
export function BatchStatusActions({ batchId, status }: { batchId: string; status: string }) {
  const router = useRouter();
  const options = TRANSITIONS[status] ?? [];
  const cancellable = !["completed", "cancelled"].includes(status);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o, i) => (
        <ConfirmDialog
          key={o.transition}
          trigger={<Button variant={i === 0 ? "default" : "outline"}>{o.label}</Button>}
          title={o.title}
          description={o.description}
          confirmLabel={o.label}
          onConfirm={async () => {
            const result = await setBatchStatusAction({ via: "institution", batchId, transition: o.transition });
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ))}
      {cancellable ? (
        <ConfirmDialog
          trigger={<Button variant="ghost">Cancel batch</Button>}
          title="Cancel this batch?"
          description="Every open enrolment is cancelled with your reason, seats are released and learners are notified. This cannot be undone."
          confirmLabel="Cancel batch"
          cancelLabel="Keep batch"
          variant="destructive"
          onConfirm={async (formData) => {
            formData.set("batchId", batchId);
            const result = await cancelBatchAction(null, formData);
            if (result.ok) router.refresh();
            return result;
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="cancel-batch-reason">Reason shown to learners</Label>
            <Textarea id="cancel-batch-reason" name="reason" rows={3} maxLength={1000} required />
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

export type InstructorItem = { id: string; name: string; role: string; bio: string | null; isPlatformUser: boolean };

function AddInstructorForm({ batchId, memberOptions, onDone }: { batchId: string; memberOptions: SelectOption[]; onDone: () => void }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(addBatchInstructorAction);
  const [member, setMember] = useState("");
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="batchId" value={batchId} />
      <FormErrorAlert state={state} fieldLabels={{ userId: "Team member", name: "Instructor name", role: "Role", bio: "Short bio" }} />
      <FormField label="Team member" name="userId" optional state={state} hint="Team members you add can take attendance and enter scores for this batch.">
        <SimpleSelect options={memberOptions} value={member} onValueChange={setMember} placeholder="Choose a team member" allowClear clearLabel="External instructor" />
      </FormField>
      {!member ? (
        <FormField label="Instructor name" name="name" required state={state} hint="For a guest or external instructor without an account.">
          <Input maxLength={120} />
        </FormField>
      ) : null}
      <FormField label="Role" name="role" required state={state}>
        <SimpleSelect options={toOptions(INSTRUCTOR_ROLE_LABELS)} defaultValue="lead" />
      </FormField>
      <FormField label="Short bio" name="bio" optional state={state}>
        <Textarea rows={3} maxLength={1000} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Adding…">
          Add instructor
        </SubmitButton>
      </div>
    </form>
  );
}

export function BatchInstructors({ batchId, instructors, memberOptions, editable }: { batchId: string; instructors: InstructorItem[]; memberOptions: SelectOption[]; editable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      {instructors.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {instructors.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{i.name}</p>
                <p className="text-sm text-muted-foreground">
                  {INSTRUCTOR_ROLE_LABELS[i.role] ?? i.role}
                  {i.isPlatformUser ? " · team member" : " · external"}
                </p>
                {i.bio ? <p className="mt-1 text-sm text-muted-foreground">{i.bio}</p> : null}
              </div>
              {editable ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={`Remove ${i.name}`}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  }
                  title={`Remove ${i.name} from this batch?`}
                  description="A team member loses access to this batch's attendance and scores unless they have broader permissions."
                  confirmLabel="Remove instructor"
                  variant="destructive"
                  onConfirm={async () => {
                    const result = await removeBatchInstructorAction({ via: "institution", instructorId: i.id });
                    if (result.ok) router.refresh();
                    return result;
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" variant="plain" title="No instructors yet" description="Add the people who teach this batch." />
      )}
      {editable ? (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <UserPlus aria-hidden="true" /> Add instructor
          </Button>
          <ResponsiveDialog open={open} onOpenChange={setOpen} title="Add an instructor">
            <AddInstructorForm batchId={batchId} memberOptions={memberOptions} onDone={() => setOpen(false)} />
          </ResponsiveDialog>
        </>
      ) : null}
    </div>
  );
}
