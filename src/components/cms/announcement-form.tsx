"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AnnouncementAudience, AnnouncementPlacement, AnnouncementPriority } from "@/db/schema";
import { saveAnnouncementAction } from "@/modules/content/actions";
import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_AUDIENCE_VALUES,
  ANNOUNCEMENT_PLACEMENT_LABELS,
  ANNOUNCEMENT_PLACEMENT_VALUES,
  ANNOUNCEMENT_PRIORITY_LABELS,
  ANNOUNCEMENT_PRIORITY_VALUES,
} from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

import { fromDatetimeLocal, toDatetimeLocal } from "./field-utils";

export type AnnouncementValues = {
  id?: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  audience: AnnouncementAudience[];
  placements: AnnouncementPlacement[];
  priority: AnnouncementPriority;
  startsAt: string | null;
  endsAt: string | null;
  isDismissible: boolean;
};

const PRIORITY_HINT: Record<AnnouncementPriority, string> = {
  low: "Shown after other notices.",
  normal: "Standard banner.",
  high: "Highlighted in gold.",
  critical: "Red banner. Use only for urgent safety or fraud warnings.",
};

const PLACEMENT_HINT: Record<AnnouncementPlacement, string> = {
  homepage_banner: "Strip above the public website header.",
  portal_banner: "Strip at the top of the chosen portals.",
  notification_centre: "Listed in the bell menu of the chosen portals.",
  ticker: "Rotating line of short updates.",
};

/** Create or edit a staff announcement with a live banner preview. Saving keeps it as a draft until published. */
export function AnnouncementForm({ values, disabled }: { values: AnnouncementValues; disabled?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const router = useRouter();
  const [state, formAction] = useActionState(saveAnnouncementAction, null);
  const [title, setTitle] = useState(values.title);
  const [body, setBody] = useState(values.body ?? "");
  const [linkLabel, setLinkLabel] = useState(values.linkLabel ?? "");
  const [linkUrl, setLinkUrl] = useState(values.linkUrl ?? "");
  const [priority, setPriority] = useState<AnnouncementPriority>(values.priority);
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(values.startsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(values.endsAt));
  const [dismissible, setDismissible] = useState(values.isDismissible);
  const [audience, setAudience] = useState<AnnouncementAudience[]>(values.audience);
  const [placements, setPlacements] = useState<AnnouncementPlacement[]>(values.placements);
  useActionToast(state, {
    onSuccess: (r) => {
      if (!values.id && r.data) router.push(CONTENT_ADMIN_PATHS.announcement(r.data.id));
      else router.refresh();
    },
  });

  const toggle = <T extends string>(list: T[], v: T, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} noValidate className="space-y-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="startsAt" value={fromDatetimeLocal(startsAt) ?? ""} />
      <input type="hidden" name="endsAt" value={fromDatetimeLocal(endsAt) ?? ""} />
      <input type="hidden" name="isDismissible" value={dismissible ? "true" : "false"} />
      <FormErrorAlert state={state} fieldLabels={{ title: "Title", audience: "Audience", placements: "Placements", endsAt: "Ends", linkUrl: "Link" }} />

      <div className="space-y-2">
        <p className="text-sm font-medium">Banner preview</p>
        <div className="overflow-hidden rounded-lg border" aria-label="Preview of the banner" role="figure">
          <AnnouncementBar
            announcement={{
              id: `admin-preview-${uid}`,
              message: title ? (body ? `${title}: ${body}` : title) : "Your announcement title",
              href: linkUrl || null,
              linkLabel: linkLabel || null,
              tone: priority === "critical" ? "critical" : priority === "high" ? "highlight" : "neutral",
              dismissible: false,
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{dismissible ? "Visitors can close it with the × button." : "Visitors cannot close it."}</p>
      </div>

      <FormField label="Title" name="title" required state={state} hint="Short and specific, for example “Office closed on 15 August”.">
        <Input maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} />
      </FormField>
      <FormField label="Message" name="body" optional state={state}>
        <Textarea rows={3} maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} disabled={disabled} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Link" name="linkUrl" optional state={state} hint="A page on this site (starting with /) or a full https:// link.">
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={500} disabled={disabled} />
        </FormField>
        <FormField label="Link text" name="linkLabel" optional state={state}>
          <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={60} placeholder="Read more" disabled={disabled} />
        </FormField>
      </div>

      <fieldset className="space-y-2" disabled={disabled} aria-describedby={fieldErrors?.audience ? `${uid}-aud-err` : undefined}>
        <legend className="text-sm font-medium">
          Who sees it <span className="text-danger-strong" aria-hidden>*</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ANNOUNCEMENT_AUDIENCE_VALUES.map((a) => (
            <div key={a} className="flex items-center gap-2">
              <Checkbox id={`${uid}-aud-${a}`} name="audience[]" value={a} checked={audience.includes(a)} onCheckedChange={(v) => setAudience((l) => toggle(l, a, v === true))} />
              <Label htmlFor={`${uid}-aud-${a}`} className="font-normal">
                {ANNOUNCEMENT_AUDIENCE_LABELS[a]}
              </Label>
            </div>
          ))}
        </div>
        {fieldErrors?.audience && (
          <p id={`${uid}-aud-err`} className="text-sm text-danger-strong">
            {fieldErrors.audience[0]}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Keep People Portal notices informational, never marketing: the portal includes users under 18, who must not receive marketing.</p>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled} aria-describedby={fieldErrors?.placements ? `${uid}-pl-err` : undefined}>
        <legend className="text-sm font-medium">
          Where it appears <span className="text-danger-strong" aria-hidden>*</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ANNOUNCEMENT_PLACEMENT_VALUES.map((p) => (
            <div key={p} className="flex items-start gap-2">
              <Checkbox id={`${uid}-pl-${p}`} name="placements[]" value={p} className="mt-0.5" checked={placements.includes(p)} onCheckedChange={(v) => setPlacements((l) => toggle(l, p, v === true))} aria-describedby={`${uid}-pl-${p}-hint`} />
              <div>
                <Label htmlFor={`${uid}-pl-${p}`} className="font-normal">
                  {ANNOUNCEMENT_PLACEMENT_LABELS[p]}
                </Label>
                <p id={`${uid}-pl-${p}-hint`} className="text-xs text-muted-foreground">
                  {PLACEMENT_HINT[p]}
                </p>
              </div>
            </div>
          ))}
        </div>
        {fieldErrors?.placements && (
          <p id={`${uid}-pl-err`} className="text-sm text-danger-strong">
            {fieldErrors.placements[0]}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">Priority</legend>
        <RadioGroup name="priority" value={priority} onValueChange={(v) => setPriority(v as AnnouncementPriority)} className="grid gap-2 sm:grid-cols-2">
          {ANNOUNCEMENT_PRIORITY_VALUES.map((p) => (
            <div key={p} className="flex items-start gap-2">
              <RadioGroupItem value={p} id={`${uid}-pr-${p}`} className="mt-0.5" aria-describedby={`${uid}-pr-${p}-hint`} />
              <div>
                <Label htmlFor={`${uid}-pr-${p}`} className="font-normal">
                  {ANNOUNCEMENT_PRIORITY_LABELS[p]}
                </Label>
                <p id={`${uid}-pr-${p}-hint`} className="text-xs text-muted-foreground">
                  {PRIORITY_HINT[p]}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Starts" optional errors={fieldErrors?.startsAt} hint="Your local time. Leave empty to start when published.">
          <Input type="datetime-local"
            suppressHydrationWarning value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={disabled} />
        </FormField>
        <FormField label="Ends" optional errors={fieldErrors?.endsAt} hint="It is removed automatically at this time.">
          <Input type="datetime-local"
            suppressHydrationWarning value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={disabled} />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Switch id={`${uid}-dis`} checked={dismissible} onCheckedChange={setDismissible} disabled={disabled} />
        <Label htmlFor={`${uid}-dis`} className="font-normal">
          Visitors can close the banner
        </Label>
      </div>

      {!disabled && <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Save as draft"}</SubmitButton>}
    </form>
  );
}
