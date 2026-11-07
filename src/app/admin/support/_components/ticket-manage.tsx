"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import {
  assignTicketAction,
  changeTicketStatusAction,
  escalateTicketAction,
  markTicketAsGrievanceAction,
  setTicketPriorityAction,
  setTicketTagsAction,
} from "@/modules/operations/admin-actions";

function useRunner() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  return { pending, run };
}

/** Assignee + priority selects that save on change (with toast feedback). */
export function TicketQuickFields({
  ticketId,
  assigneeId,
  priority,
  staffOptions,
  priorityOptions,
}: {
  ticketId: string;
  assigneeId: string | null;
  priority: string;
  staffOptions: SelectOption[];
  priorityOptions: SelectOption[];
}) {
  const { pending, run } = useRunner();
  return (
    <div className="space-y-4" aria-busy={pending || undefined}>
      <div className="space-y-1.5">
        <Label htmlFor={`assignee-${ticketId}`}>Assignee</Label>
        <SimpleSelect
          id={`assignee-${ticketId}`}
          name="assignee"
          options={staffOptions}
          defaultValue={assigneeId ?? undefined}
          allowClear
          clearLabel="Unassigned"
          placeholder="Unassigned"
          onValueChange={(v) => run(() => assignTicketAction({ id: ticketId, assigneeUserId: v || null }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`priority-${ticketId}`}>Priority</Label>
        <SimpleSelect
          id={`priority-${ticketId}`}
          name="priority"
          options={priorityOptions}
          defaultValue={priority}
          onValueChange={(v) => v && run(() => setTicketPriorityAction({ ticketId, priority: v as "low" | "normal" | "high" | "urgent" }))}
        />
      </div>
    </div>
  );
}

/** Change status; resolving requires a resolution summary that the requester sees. */
export function TicketStatusForm({ ticketId, status, statusOptions }: { ticketId: string; status: string; statusOptions: SelectOption[] }) {
  const [next, setNext] = useState("");
  const [state, formAction] = useActionState(changeTicketStatusAction, null);
  useActionToast(state, { onSuccess: () => setNext("") });
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormErrorAlert state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField label="Move to" name="status" required state={state}>
        {(field) => <SimpleSelect {...field} options={statusOptions.filter((o) => o.value !== status)} value={next} onValueChange={setNext} placeholder="Choose a status" />}
      </FormField>
      {next === "resolved" ? (
        <FormField label="Resolution (sent to the requester)" name="resolution" required state={state}>
          <Textarea rows={4} maxLength={5000} />
        </FormField>
      ) : null}
      <SubmitButton pendingLabel="Updating…" variant="outline" disabled={!next}>
        Update status
      </SubmitButton>
    </form>
  );
}

/** Escalate with a reason (internal); optionally hand over to someone else. */
export function TicketEscalateForm({ ticketId, staffOptions }: { ticketId: string; staffOptions: SelectOption[] }) {
  const [state, formAction] = useActionState(escalateTicketAction, null);
  useActionToast(state);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormErrorAlert state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField label="Reason for escalation" name="note" required state={state} hint="Recorded as an internal note.">
        <Textarea rows={3} maxLength={2000} />
      </FormField>
      <FormField label="Hand over to" name="assigneeUserId" optional state={state}>
        {(field) => <SimpleSelect {...field} options={staffOptions} allowClear clearLabel="Keep current assignee" placeholder="Keep current assignee" />}
      </FormField>
      <SubmitButton pendingLabel="Escalating…" variant="outline">
        Escalate
      </SubmitButton>
    </form>
  );
}

/** Register a regular request as a formal grievance (GRV code + statutory timeline). */
export function MarkGrievanceForm({ ticketId, grievanceOptions }: { ticketId: string; grievanceOptions: SelectOption[] }) {
  const [type, setType] = useState("");
  const { pending, run } = useRunner();
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`grievance-${ticketId}`}>Grievance type</Label>
        <SimpleSelect id={`grievance-${ticketId}`} name="grievanceType" options={grievanceOptions} value={type} onValueChange={setType} placeholder="Choose a type" />
      </div>
      <Button
        type="button"
        variant="outline"
        aria-disabled={pending || !type || undefined}
        onClick={() => type && run(() => markTicketAsGrievanceAction({ ticketId, grievanceType: type as never }))}
      >
        Register as grievance
      </Button>
    </div>
  );
}

export function TicketTagsForm({ ticketId, tags }: { ticketId: string; tags: string[] }) {
  const [value, setValue] = useState<string[]>(tags);
  const { pending, run } = useRunner();
  return (
    <div className="space-y-3">
      <Label htmlFor={`tags-${ticketId}`}>Tags (internal)</Label>
      <TagInput id={`tags-${ticketId}`} name="tags" value={value} onChange={setValue} lowercase maxTags={20} placeholder="Add a tag" />
      <Button type="button" variant="outline" size="sm" aria-disabled={pending || undefined} onClick={() => run(() => setTicketTagsAction({ ticketId, tags: value }))}>
        Save tags
      </Button>
    </div>
  );
}
