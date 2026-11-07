"use client";

import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactElement } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";
import { rescheduleInterviewAction, scheduleInterviewAction } from "@/modules/recruitment/actions";
import { INTERVIEW_MODE_LABELS, INTERVIEW_MODE_OPTIONS, PARTICIPANT_ROLE_OPTIONS } from "@/modules/recruitment/constants";

import { intOf, textOf, useRunAction } from "./use-run-action";

type Mode = (typeof INTERVIEW_MODE_OPTIONS)[number];
type Role = (typeof PARTICIPANT_ROLE_OPTIONS)[number];
type Participant = { key: number; userId: string | null; name: string; email: string; role: Role };

const MODES: SelectOption[] = INTERVIEW_MODE_OPTIONS.map((m) => ({ value: m, label: INTERVIEW_MODE_LABELS[m] }));
const ROLES: SelectOption[] = PARTICIPANT_ROLE_OPTIONS.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }));
const DURATIONS: SelectOption[] = [15, 30, 45, 60, 90, 120, 180, 240].map((m) => ({ value: String(m), label: m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? "hour" : "hours"}` }));

export type Me = { userId: string; name: string; email: string | null };

function TimeFields({ state, timeZones, defaultTimeZone, defaults }: { state: Parameters<typeof FormField>[0]["state"]; timeZones: SelectOption[]; defaultTimeZone: string; defaults?: { startsAtLocal?: string; durationMinutes?: number } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Date and time" name="startsAtLocal" required state={state} hint="In the time zone below.">
        <Input type="datetime-local" defaultValue={defaults?.startsAtLocal} />
      </FormField>
      <FormField label="Duration" name="durationMinutes" state={state}>
        <SimpleSelect options={DURATIONS} defaultValue={String(defaults?.durationMinutes ?? 60)} />
      </FormField>
      <FormField label="Time zone" name="timezone" required state={state} className="sm:col-span-2">
        <SearchableSelect options={timeZones} defaultValue={defaultTimeZone} searchPlaceholder="Search time zones" emptyText="No time zone found." />
      </FormField>
    </div>
  );
}

function PlaceFields({ state, defaults }: { state: Parameters<typeof FormField>[0]["state"]; defaults?: { location?: string | null; meetingUrl?: string | null; candidateInstructions?: string | null } }) {
  return (
    <>
      <FormField label="Location" name="location" optional state={state} hint="Address for in-person interviews and trade tests.">
        <Input maxLength={500} defaultValue={defaults?.location ?? undefined} />
      </FormField>
      <FormField label="Meeting link" name="meetingUrl" optional state={state}>
        <Input type="url" inputMode="url" placeholder="https://" defaultValue={defaults?.meetingUrl ?? undefined} />
      </FormField>
      <FormField label="Instructions for the candidate" name="candidateInstructions" optional state={state} hint="What to bring, who to ask for. The candidate sees this.">
        <Textarea rows={3} maxLength={2000} defaultValue={defaults?.candidateInstructions ?? undefined} />
      </FormField>
    </>
  );
}

/** Schedule an interview for an application (candidate is notified; times stored with the time zone). */
export function ScheduleInterviewDialog({
  applicationId,
  candidateName,
  me,
  timeZones,
  defaultTimeZone,
  nextRound,
  trigger,
}: {
  applicationId: string;
  candidateName: string;
  me: Me;
  timeZones: SelectOption[];
  defaultTimeZone: string;
  nextRound: number;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Participant[]>([{ key: 1, userId: me.userId, name: me.name, email: me.email ?? "", role: "interviewer" }]);
  const schedule = useRunAction(scheduleInterviewAction, {
    onSuccess: () => {
      track("form_submitted", { form: "employer_schedule_interview" });
      setOpen(false);
    },
  });

  const update = (key: number, patch: Partial<Participant>) => setPanel((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void schedule.run({
      portal: "employer",
      applicationId,
      roundName: String(form.get("roundName") ?? ""),
      roundNumber: intOf(form, "roundNumber"),
      mode: (textOf(form, "mode") ?? "video") as Mode,
      startsAtLocal: String(form.get("startsAtLocal") ?? ""),
      timezone: String(form.get("timezone") ?? ""),
      durationMinutes: intOf(form, "durationMinutes") ?? 60,
      location: textOf(form, "location") ?? null,
      meetingUrl: textOf(form, "meetingUrl") ?? null,
      candidateInstructions: textOf(form, "candidateInstructions") ?? null,
      participants: panel.filter((p) => p.name.trim()).map((p) => ({ userId: p.userId, name: p.name.trim(), email: p.email.trim() || null, role: p.role })),
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) schedule.reset();
      }}
      size="lg"
      trigger={
        trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <CalendarPlus aria-hidden className="size-4" />
            Schedule interview
          </Button>
        )
      }
      title={`Schedule an interview with ${candidateName}`}
      description="The candidate and panel are notified and reminded 24 hours and 2 hours before."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={schedule.state} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <FormField label="Round name" name="roundName" required state={schedule.state}>
            <Input maxLength={120} defaultValue={nextRound === 1 ? "First interview" : `Round ${nextRound}`} />
          </FormField>
          <FormField label="Round number" name="roundNumber" state={schedule.state}>
            <Input type="number" min={1} max={20} defaultValue={nextRound} />
          </FormField>
        </div>
        <FormField label="Format" name="mode" required state={schedule.state}>
          <SimpleSelect options={MODES} defaultValue="video" />
        </FormField>
        <TimeFields state={schedule.state} timeZones={timeZones} defaultTimeZone={defaultTimeZone} />
        <PlaceFields state={schedule.state} />
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Interview panel</legend>
          <p className="text-xs text-muted-foreground">Panel emails are visible only to organisers. Members with accounts must belong to your organisation.</p>
          {panel.map((p, i) => (
            <div key={p.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto] sm:items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor={`panel-name-${p.key}`}>
                  Name
                </label>
                <Input id={`panel-name-${p.key}`} value={p.name} maxLength={200} onChange={(e) => update(p.key, { name: e.target.value, userId: p.userId === me.userId && e.target.value !== me.name ? null : p.userId })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor={`panel-email-${p.key}`}>
                  Email
                </label>
                <Input id={`panel-email-${p.key}`} type="email" value={p.email} onChange={(e) => update(p.key, { email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium" id={`panel-role-${p.key}`}>
                  Role
                </span>
                <SimpleSelect options={ROLES} value={p.role} onValueChange={(v) => update(p.key, { role: v as Role })} aria-label={`Role of panel member ${i + 1}`} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove panel member ${i + 1}`} onClick={() => setPanel((list) => list.filter((x) => x.key !== p.key))}>
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          ))}
          {panel.length < 20 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setPanel((list) => [...list, { key: Date.now(), userId: null, name: "", email: "", role: "interviewer" }])}>
              <Plus aria-hidden className="size-4" />
              Add panel member
            </Button>
          ) : null}
        </fieldset>
        <div className="flex justify-end">
          <SubmitButton pending={schedule.pending} pendingLabel="Scheduling…">
            Schedule interview
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

export type RescheduleDefaults = {
  interviewId: string;
  startsAtLocal: string;
  timezone: string;
  durationMinutes: number;
  location: string | null;
  meetingUrl: string | null;
  candidateInstructions: string | null;
};

export function RescheduleInterviewDialog({ defaults, timeZones, trigger }: { defaults: RescheduleDefaults; timeZones: SelectOption[]; trigger?: ReactElement }) {
  const [open, setOpen] = useState(false);
  const reschedule = useRunAction(rescheduleInterviewAction, { onSuccess: () => setOpen(false) });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void reschedule.run({
      portal: "employer",
      interviewId: defaults.interviewId,
      startsAtLocal: String(form.get("startsAtLocal") ?? ""),
      timezone: String(form.get("timezone") ?? ""),
      durationMinutes: intOf(form, "durationMinutes") ?? 60,
      location: textOf(form, "location") ?? null,
      meetingUrl: textOf(form, "meetingUrl") ?? null,
      candidateInstructions: textOf(form, "candidateInstructions") ?? null,
      reason: textOf(form, "reason") ?? null,
    });
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reschedule.reset();
      }}
      trigger={
        trigger ?? (
          <Button type="button" variant="outline" size="sm">
            Reschedule
          </Button>
        )
      }
      title="Reschedule interview"
      description="The candidate and panel are told about the new time."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={reschedule.state} />
        <TimeFields state={reschedule.state} timeZones={timeZones} defaultTimeZone={defaults.timezone} defaults={defaults} />
        <PlaceFields state={reschedule.state} defaults={defaults} />
        <FormField label="Reason" name="reason" optional state={reschedule.state} hint="Shared with the candidate.">
          <Textarea rows={2} maxLength={1000} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pending={reschedule.pending} pendingLabel="Saving…">
            Reschedule
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
