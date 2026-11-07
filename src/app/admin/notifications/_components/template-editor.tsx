"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { previewNotificationTemplateAction, saveNotificationTemplateAction, setNotificationTemplateActiveAction } from "@/modules/notifications/actions";
import type { TemplatePreview } from "@/modules/notifications/types";

import { sendTestNotificationAction } from "../actions";

export type TemplateEditorProps = {
  eventKey: string;
  channel: "in_app" | "email" | "sms" | "whatsapp";
  locale: string;
  placeholders: string[];
  /** Saved override for this event + channel + locale, if any. */
  override: { id: string; subject: string | null; body: string; whatsappTemplateName: string | null; whatsappLanguageCode: string | null; smsTemplateId: string | null; isActive: boolean; version: number } | null;
  /** Code default used when there is no active override. */
  fallback: { subject: string; body: string };
};

/**
 * Template editor with live preview (rendered with the event's sample data, debounced) and a test send
 * to yourself. Saving creates or versions the override for this event, channel and language.
 */
export function TemplateEditor({ eventKey, channel, locale, placeholders, override, fallback }: TemplateEditorProps) {
  const [subject, setSubject] = useState(override?.subject ?? fallback.subject);
  const [body, setBody] = useState(override?.body ?? fallback.body);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const [toggling, startToggle] = useTransition();
  const router = useRouter();
  const [state, formAction] = useActionState(saveNotificationTemplateAction, null);
  useActionToast(state, { onSuccess: () => router.refresh() });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const hasSubject = channel === "email" || channel === "in_app";

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const result = await previewNotificationTemplateAction({ eventKey, channel, locale, subject: hasSubject ? subject : undefined, body });
      if (result.ok && result.data) {
        setPreview(result.data);
        setPreviewError(null);
      } else if (!result.ok) setPreviewError(result.error);
    }, 450);
    return () => window.clearTimeout(handle);
  }, [eventKey, channel, locale, subject, body, hasSubject]);

  const insertPlaceholder = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form action={formAction} className="space-y-5" noValidate data-testid="template-editor">
        <FormErrorAlert state={state} />
        <input type="hidden" name="eventKey" value={eventKey} />
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="locale" value={locale} />
        {hasSubject ? (
          <FormField label="Subject" name="subject" required state={state}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          </FormField>
        ) : null}
        <FormField
          label={channel === "whatsapp" ? "Template parameters (one {{placeholder}} per line, in order)" : "Message"}
          name="body"
          required
          state={state}
          hint={channel === "sms" ? "Keep SMS short; registered (DLT) templates must match word for word." : "Markdown-lite: **bold**, - lists, [label](url). Values are inserted safely."}
        >
          <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={12} maxLength={10000} className="font-mono text-sm" />
        </FormField>
        {placeholders.length ? (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Insert a value</p>
            <div className="flex flex-wrap gap-2">
              {placeholders.map((p) => (
                <Button key={p} type="button" variant="outline" size="sm" onClick={() => insertPlaceholder(p)}>
                  {`{{${p}}}`}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {channel === "whatsapp" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Approved WhatsApp template name" name="whatsappTemplateName" state={state}>
              <Input defaultValue={override?.whatsappTemplateName ?? ""} maxLength={200} />
            </FormField>
            <FormField label="Template language code" name="whatsappLanguageCode" optional state={state}>
              <Input defaultValue={override?.whatsappLanguageCode ?? ""} maxLength={20} placeholder="en" />
            </FormField>
          </div>
        ) : null}
        {channel === "sms" ? (
          <FormField label="DLT template ID" name="smsTemplateId" optional state={state}>
            <Input defaultValue={override?.smsTemplateId ?? ""} maxLength={100} />
          </FormField>
        ) : null}
        <div className="flex items-center gap-2">
          <Checkbox id="isActive" name="isActive" value="on" defaultChecked={override?.isActive ?? true} />
          <Label htmlFor="isActive">Use this template (active)</Label>
        </div>
        <div className="flex flex-wrap gap-3">
          <SubmitButton pendingLabel="Saving…">{override ? `Save version ${override.version + 1}` : "Save template"}</SubmitButton>
          <Button
            type="button"
            variant="outline"
            aria-disabled={testing || undefined}
            onClick={() =>
              startTest(async () => {
                const r = await sendTestNotificationAction({ eventKey, channel, locale, subject: hasSubject ? subject : undefined, body });
                if (r.ok) toast.success(r.message ?? "Test sent");
                else toast.error(r.error);
              })
            }
          >
            {testing ? "Sending test…" : "Send a test to myself"}
          </Button>
          {override ? (
            <Button
              type="button"
              variant="ghost"
              aria-disabled={toggling || undefined}
              onClick={() =>
                startToggle(async () => {
                  const r = await setNotificationTemplateActiveAction({ id: override.id, isActive: !override.isActive });
                  if (r.ok) {
                    toast.success(r.message ?? "Saved");
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              {override.isActive ? "Deactivate (use the default)" : "Activate saved version"}
            </Button>
          ) : null}
        </div>
      </form>

      <section aria-labelledby="preview-heading" className="space-y-3">
        <h2 id="preview-heading" className="font-heading text-base font-semibold text-foreground">
          Preview with sample data
        </h2>
        <div aria-live="polite" className="space-y-3">
          {previewError ? <Callout tone="danger">{previewError}</Callout> : null}
          {preview?.unknownPlaceholders.length ? (
            <Callout tone="warning" title="Unknown values">
              These placeholders are not provided for this event and will be empty: {preview.unknownPlaceholders.map((p) => `{{${p}}}`).join(", ")}
            </Callout>
          ) : null}
          {preview ? (
            <>
              {preview.subject ? (
                <p className="text-sm">
                  <span className="font-medium text-foreground">Subject: </span>
                  {preview.subject}
                </p>
              ) : null}
              {preview.html ? (
                <iframe title="Rendered message preview" sandbox="" srcDoc={preview.html} className="h-[32rem] w-full rounded-xl border border-border bg-white" />
              ) : null}
              <details open={!preview.html} className="rounded-xl border border-border bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium text-foreground">Plain text</summary>
                <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-foreground">{preview.text}</pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Rendering preview…</p>
          )}
        </div>
      </section>
    </div>
  );
}
