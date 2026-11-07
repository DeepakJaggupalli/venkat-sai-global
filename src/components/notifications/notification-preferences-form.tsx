"use client";

import { Lock } from "lucide-react";
import { useActionState, useId, useMemo, useState } from "react";

import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, SubmitButton, useActionToast } from "@/components/shared/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveNotificationPreferencesAction } from "@/modules/notifications/actions";
import type { NotificationChannel } from "@/modules/notifications/events";
import type { PreferenceChange, PreferenceMatrix } from "@/modules/notifications/types";

export type NotificationPreferencesLabels = {
  save: string;
  saving: string;
  alwaysSent: string;
  channelNotes: string;
  intro: string;
  customised: string;
  /** Overrides for category labels / descriptions and channel labels (People Portal translations). */
  categories?: Partial<Record<string, { label?: string; description?: string }>>;
  channels?: Partial<Record<NotificationChannel, string>>;
};

export const NOTIFICATION_PREFERENCES_DEFAULT_LABELS: NotificationPreferencesLabels = {
  save: "Save preferences",
  saving: "Saving…",
  alwaysSent: "Always sent, whatever you choose here:",
  channelNotes: "About these channels",
  intro: "Choose how you hear about each kind of update. Important account, security and transaction messages are always sent by email and in-app.",
  customised: "Changed from the default",
};

type NotificationPreferencesFormProps = {
  matrix: PreferenceMatrix;
  labels?: Partial<NotificationPreferencesLabels>;
};

const key = (category: string, channel: string) => `${category}:${channel}`;

/**
 * Category × channel preference matrix. Each category is a labelled group of switches (one per channel
 * enabled on the platform); mandatory messages are listed as "always sent". Posts every shown cell as
 * `preferences:json` to saveNotificationPreferencesAction (the server stores only differences from the defaults).
 */
export function NotificationPreferencesForm({ matrix, labels: labelOverrides }: NotificationPreferencesFormProps) {
  const labels = { ...NOTIFICATION_PREFERENCES_DEFAULT_LABELS, ...labelOverrides };
  const baseId = useId();
  const [state, formAction] = useActionState(saveNotificationPreferencesAction, null);
  useActionToast(state);

  const initial = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const category of matrix.categories) for (const cell of category.cells) map.set(key(category.category, cell.channel), cell.enabled);
    return map;
  }, [matrix]);
  const [values, setValues] = useState(initial);

  const changes: PreferenceChange[] = matrix.categories.flatMap((category) =>
    category.cells.map((cell) => ({ category: category.category, channel: cell.channel, enabled: values.get(key(category.category, cell.channel)) ?? cell.enabled })),
  );
  const channelLabel = (channel: NotificationChannel) => labels.channels?.[channel] ?? matrix.channels.find((c) => c.channel === channel)?.label ?? channel;
  const notes = matrix.channels.filter((c) => c.note);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="preferences:json" value={JSON.stringify(changes)} />
      <FormErrorAlert state={state} />
      <p className="text-sm text-muted-foreground">{labels.intro}</p>

      {notes.length > 0 && (
        <Callout tone="info" title={labels.channelNotes}>
          <ul className="list-disc space-y-1 pl-5">
            {notes.map((c) => (
              <li key={c.channel}>
                <span className="font-medium">{channelLabel(c.channel)}:</span> {c.note}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="space-y-3">
        {matrix.categories.map((category) => {
          const headingId = `${baseId}-${category.category}-h`;
          const descId = `${baseId}-${category.category}-d`;
          const text = labels.categories?.[category.category];
          const locked = new Map<string, NotificationChannel[]>();
          for (const cell of category.cells) {
            for (const event of cell.lockedEvents) locked.set(event, [...(locked.get(event) ?? []), cell.channel]);
          }
          return (
            <div key={category.category} role="group" aria-labelledby={headingId} aria-describedby={descId} className="rounded-xl border border-border bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 md:max-w-md">
                  <h2 id={headingId} className="font-heading text-base font-semibold text-navy">
                    {text?.label ?? category.label}
                  </h2>
                  <p id={descId} className="mt-1 text-sm text-muted-foreground">
                    {text?.description ?? category.description}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8">
                  {category.cells.map((cell) => {
                    const id = `${baseId}-${category.category}-${cell.channel}`;
                    const checked = values.get(key(category.category, cell.channel)) ?? cell.enabled;
                    const changed = checked !== cell.defaultEnabled;
                    return (
                      <div key={cell.channel} className="flex items-center gap-3">
                        <Switch
                          id={id}
                          checked={checked}
                          onCheckedChange={(next) =>
                            setValues((current) => {
                              const copy = new Map(current);
                              copy.set(key(category.category, cell.channel), next === true);
                              return copy;
                            })
                          }
                          aria-describedby={changed ? `${id}-changed` : undefined}
                        />
                        <Label htmlFor={id} className="text-sm font-medium text-navy">
                          {channelLabel(cell.channel)}
                        </Label>
                        {changed && (
                          <span id={`${id}-changed`} className="sr-only">
                            {labels.customised}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {locked.size > 0 && (
                <p className="mt-4 flex gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    {labels.alwaysSent}{" "}
                    {[...locked.entries()].map(([event, channels], i) => (
                      <span key={event}>
                        {i > 0 && "; "}
                        {event} ({channels.map(channelLabel).join(", ")})
                      </span>
                    ))}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingLabel={labels.saving}>{labels.save}</SubmitButton>
      </div>
    </form>
  );
}
