"use client";

import { CalendarPlus, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createAttendanceSessionAction, deleteAttendanceSessionAction, recordAttendanceAction } from "@/modules/training/actions";

import { ATTENDANCE_LABELS } from "./labels";
import { useInstitutionForm } from "./use-form-action";

type Status = "present" | "late" | "absent" | "excused";
const STATUSES: Status[] = ["present", "late", "absent", "excused"];
const STATUS_STYLE: Record<Status, string> = {
  present: "peer-checked:border-success peer-checked:bg-success-soft peer-checked:text-success-strong",
  late: "peer-checked:border-warning peer-checked:bg-warning-soft peer-checked:text-warning-strong",
  absent: "peer-checked:border-danger peer-checked:bg-danger-soft peer-checked:text-danger-strong",
  excused: "peer-checked:border-info peer-checked:bg-info-soft peer-checked:text-info",
};

export type AttendanceSessionItem = { id: string; sessionDate: string; topic: string | null };
export type AttendanceLearner = { enrolmentId: string; name: string };

function NewSessionForm({ batchId, moduleOptions, onDone }: { batchId: string; moduleOptions: SelectOption[]; onDone: (id?: string) => void }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(createAttendanceSessionAction);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone((state.data as { id?: string } | undefined)?.id);
    }
  }, [state, router, onDone]);
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="batchId" value={batchId} />
      <FormErrorAlert state={state} fieldLabels={{ sessionDate: "Session date", topic: "Topic", courseModuleId: "Syllabus module", durationHours: "Duration (hours)" }} />
      <FormField label="Session date" name="sessionDate" required state={state}>
        <Input type="date" defaultValue={iso} />
      </FormField>
      <FormField label="Topic" name="topic" optional state={state}>
        <Input maxLength={200} />
      </FormField>
      {moduleOptions.length ? (
        <FormField label="Syllabus module" name="courseModuleId" optional state={state}>
          <SimpleSelect options={moduleOptions} placeholder="Choose a module" allowClear clearLabel="None" />
        </FormField>
      ) : null}
      <FormField label="Duration (hours)" name="durationHours" optional state={state}>
        <Input type="number" inputMode="decimal" min={0.25} max={24} step="0.25" />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Adding…">
          Add session
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Mobile-first attendance register: pick a session, tap a status per learner (large radio targets), save.
 * Unmarked learners are not sent, so saving never overwrites a record you did not touch.
 */
export function AttendanceTaker({
  batchId,
  sessions,
  learners,
  records,
  moduleOptions,
  canManageSessions,
}: {
  batchId: string;
  sessions: AttendanceSessionItem[];
  learners: AttendanceLearner[];
  /** sessionId → enrolmentId → status */
  records: Record<string, Record<string, Status>>;
  moduleOptions: SelectOption[];
  canManageSessions: boolean;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(sessions.at(-1)?.id ?? "");
  // Unsaved changes per session, layered over the saved register.
  const [edits, setEdits] = useState<Record<string, Record<string, Status>>>({});
  const marks: Record<string, Status> = { ...(records[sessionId] ?? {}), ...(edits[sessionId] ?? {}) };
  const setMarks = (update: (current: Record<string, Status>) => Record<string, Status>) => setEdits((e) => ({ ...e, [sessionId]: update(marks) }));
  const [newOpen, setNewOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [announcement, setAnnouncement] = useState("");

  const session = sessions.find((s) => s.id === sessionId);
  const sessionOptions = useMemo(() => [...sessions].reverse().map((s) => ({ value: s.id, label: `${s.sessionDate}${s.topic ? ` · ${s.topic}` : ""}` })), [sessions]);
  const counts = STATUSES.map((s) => ({ s, n: Object.values(marks).filter((m) => m === s).length }));
  const unmarked = learners.filter((l) => !marks[l.enrolmentId]).length;

  function save() {
    const list = Object.entries(marks).map(([enrolmentId, status]) => ({ enrolmentId, status }));
    if (!list.length) {
      toast.error("Mark at least one learner.");
      return;
    }
    const fd = new FormData();
    fd.set("via", "institution");
    fd.set("sessionId", sessionId);
    fd.set("records:json", JSON.stringify(list));
    startSaving(async () => {
      const result = await recordAttendanceAction(null, fd);
      if (result.ok) {
        toast.success(result.message ?? "Attendance saved.");
        setAnnouncement(`Attendance saved for ${list.length} learners.`);
        router.refresh();
        setEdits((e) => {
          const next = { ...e };
          delete next[sessionId];
          return next;
        });
      } else {
        toast.error(result.error);
        setAnnouncement(result.error);
      }
    });
  }

  if (!learners.length) {
    return <EmptyState size="sm" title="No learners to mark yet" description="Attendance can be taken for confirmed and in-progress learners." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="attendance-session" className="text-sm font-medium">
            Session
          </label>
          {sessions.length ? (
            <SimpleSelect id="attendance-session" options={sessionOptions} value={sessionId} onValueChange={setSessionId} placeholder="Choose a session" />
          ) : (
            <p className="text-sm text-muted-foreground">No sessions yet. Add today&apos;s session to start.</p>
          )}
        </div>
        {canManageSessions ? (
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            <CalendarPlus aria-hidden="true" /> New session
          </Button>
        ) : null}
      </div>

      {session ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {counts
                .filter((c) => c.n)
                .map((c) => `${c.n} ${ATTENDANCE_LABELS[c.s]?.toLowerCase()}`)
                .join(" · ") || "Nobody marked yet"}
              {unmarked ? ` · ${unmarked} unmarked` : ""}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMarks((m) => Object.fromEntries(learners.map((l) => [l.enrolmentId, m[l.enrolmentId] ?? "present"])))}
            >
              <Check aria-hidden="true" /> Mark unmarked as present
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border" aria-label={`Attendance for ${session.sessionDate}`}>
            {learners.map((l) => (
              <li key={l.enrolmentId} className="space-y-2 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0" data-testid="attendance-row">
                <p className="font-medium text-foreground" id={`att-${l.enrolmentId}`}>
                  {l.name}
                </p>
                <div role="radiogroup" aria-labelledby={`att-${l.enrolmentId}`} className="grid grid-cols-4 gap-1.5 sm:w-auto">
                  {STATUSES.map((s) => (
                    <label key={s} className="relative">
                      <input
                        type="radio"
                        name={`att-${l.enrolmentId}`}
                        value={s}
                        checked={marks[l.enrolmentId] === s}
                        onChange={() => setMarks((m) => ({ ...m, [l.enrolmentId]: s }))}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border px-2 text-sm font-medium text-muted-foreground transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring sm:min-w-20",
                          STATUS_STYLE[s],
                        )}
                      >
                        {ATTENDANCE_LABELS[s]}
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {canManageSessions ? (
              <ConfirmDialog
                trigger={<Button variant="ghost">Delete session</Button>}
                title="Delete this session?"
                description="Its attendance records are removed and attendance percentages recalculated."
                confirmLabel="Delete session"
                variant="destructive"
                onConfirm={async () => {
                  const result = await deleteAttendanceSessionAction({ via: "institution", sessionId });
                  if (result.ok) {
                    setSessionId("");
                    router.refresh();
                  }
                  return result;
                }}
              />
            ) : (
              <span />
            )}
            <Button onClick={save} disabled={saving} aria-disabled={saving} size="lg" className="w-full sm:w-auto">
              {saving ? "Saving…" : "Save attendance"}
            </Button>
          </div>
        </>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <ResponsiveDialog open={newOpen} onOpenChange={setNewOpen} title="New session">
        <NewSessionForm
          batchId={batchId}
          moduleOptions={moduleOptions}
          onDone={(id) => {
            setNewOpen(false);
            if (id) setSessionId(id);
          }}
        />
      </ResponsiveDialog>
    </div>
  );
}
