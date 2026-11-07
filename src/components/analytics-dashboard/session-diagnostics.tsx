"use client";

import { FileSearch } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition, type FormEvent } from "react";

import { openSessionTimelineAction } from "@/app/admin/analytics/actions";
import { Callout } from "@/components/shared/callout";
import { KeyValueList } from "@/components/shared/key-value-list";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SessionTimeline } from "@/modules/analytics/types";

import { formatDuration, propEntries } from "./format";

/**
 * Opens one session's timeline. A reason is mandatory; the server records it in the data-access log and
 * the audit trail before returning anything. The timeline lives only in this dialog's memory.
 */
export function OpenSessionButton({ sessionId, timeZone, defaultOpen = false, label = "Open" }: { sessionId: string; timeZone: string; defaultOpen?: boolean; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<SessionTimeline | null>(null);
  const [pending, start] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTimeline(null);
      setReason("");
      setError(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await openSessionTimelineAction({ sessionId, reason });
      if (result.ok && result.data) setTimeline(result.data);
      else setError(result.ok ? "The session could not be opened." : (result.fieldErrors?.reason?.join(" ") ?? result.error));
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={timeline ? "Session timeline" : "Open session diagnostics"}
      description={timeline ? "Pseudonymous record of one visit. Do not copy it outside the Command Centre." : "Session details are restricted. Your reason is recorded in the access log with your name."}
      trigger={
        <Button variant="outline" size="sm">
          <FileSearch aria-hidden="true" />
          {label}
          <span className="sr-only"> session diagnostics</span>
        </Button>
      }
    >
      {timeline ? (
        <TimelineView timeline={timeline} timeZone={timeZone} />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? (
            <Callout tone="danger" title="Could not open the session" live="assertive">
              {error}
            </Callout>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reason`}>
              Reason for opening <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={`${id}-reason`}
              required
              aria-required="true"
              aria-describedby={`${id}-hint`}
              minLength={10}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: employer reported the requirement form fails on mobile"
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              At least 10 characters. Use this only to diagnose a reported problem.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} aria-disabled={pending}>
              {pending ? "Opening…" : "Open timeline"}
            </Button>
          </div>
        </form>
      )}
    </ResponsiveDialog>
  );
}

function fmt(value: Date | string, timeZone: string, withSeconds = false): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  }).format(new Date(value));
}

function TimelineView({ timeline, timeZone }: { timeline: SessionTimeline; timeZone: string }) {
  const s = timeline.session;
  const utm = [s.utm.source, s.utm.medium, s.utm.campaign].filter(Boolean).join(" / ");
  return (
    <div className="space-y-6" aria-live="polite">
      <KeyValueList
        columns={2}
        dense
        items={[
          { label: "Started", value: fmt(s.startedAt, timeZone) },
          { label: "Duration", value: formatDuration(s.durationSeconds) },
          { label: "Landing page", value: s.landingPath ? <code className="font-mono text-xs break-all">{s.landingPath}</code> : null },
          { label: "Exit page", value: s.exitPath ? <code className="font-mono text-xs break-all">{s.exitPath}</code> : null },
          { label: "Source", value: s.source },
          { label: "Campaign tags", value: utm || null },
          { label: "Device", value: [s.deviceType, s.browser, s.os].filter(Boolean).join(" · ") || null },
          { label: "Country", value: s.countryCode },
          { label: "Language", value: s.locale },
          { label: "Visitor", value: s.isNewVisitor ? "First visit" : "Returning" },
          { label: "Consent", value: s.consentLevel.replace(/_/g, " ") },
          {
            label: "Signed in",
            value: s.userId ? (
              <Link href={`/admin/users/${s.userId}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
                Open the user record
              </Link>
            ) : (
              "No"
            ),
          },
        ]}
      />

      <section aria-labelledby="timeline-events" className="space-y-2">
        <h3 id="timeline-events" className="font-heading text-base font-semibold">
          Events ({timeline.events.length.toLocaleString("en-IN")})
        </h3>
        {timeline.events.length ? (
          <ol className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {timeline.events.map((e) => {
              const props = propEntries(e.props);
              return (
                <li key={e.id} className="rounded-lg border p-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <code className="font-mono text-xs font-semibold">{e.name}</code>
                    <time className="text-xs text-muted-foreground tabular-nums" dateTime={new Date(e.occurredAt).toISOString()}>
                      {fmt(e.occurredAt, timeZone, true)}
                    </time>
                  </div>
                  {e.path ? <p className="font-mono text-xs break-all text-muted-foreground">{e.path}</p> : null}
                  {props.length ? <p className="mt-1 font-mono text-xs break-all">{props.join(" · ")}</p> : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No events were recorded in this session.</p>
        )}
      </section>

      {timeline.scroll.length ? (
        <section aria-labelledby="timeline-scroll" className="space-y-2">
          <h3 id="timeline-scroll" className="font-heading text-base font-semibold">
            Scroll depth
          </h3>
          <ul className="space-y-1 text-sm">
            {timeline.scroll.map((r, i) => (
              <li key={`${r.path}-${i}`} className="flex justify-between gap-3">
                <code className="font-mono text-xs break-all">{r.path}</code>
                <span className="tabular-nums">{r.maxDepthPct}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
