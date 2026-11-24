"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";

import { shrinkImageIfNeeded } from "@/components/documents/shrink-image";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import { CV_ACCEPT, CV_MAX_BYTES, CV_TYPES_LABEL } from "@/modules/operations/cv-submission-schemas";

/**
 * Staff attach the CV a candidate sent later (usually on WhatsApp: save it from the chat, then choose it here), or
 * replace the attached one. Posts one file to /admin/cv-submissions/<id>/cv; large photos are shrunk first.
 */
export function AttachCvForm({ submissionId, replace = false }: { submissionId: string; replace?: boolean }) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (!file) {
      setError("Choose the CV file first.");
      input.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const prepared = await shrinkImageIfNeeded(file, { maxBytes: CV_MAX_BYTES });
      if (prepared.size > CV_MAX_BYTES) {
        setError("This file is larger than 4 MB. Choose a smaller file or a photo of the first page.");
        return;
      }
      const data = new FormData();
      data.set("cv", prepared, prepared.name);
      const response = await fetch(`/admin/cv-submissions/${submissionId}/cv`, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const result = (await response.json().catch(() => null)) as ActionResult<unknown> | null;
      if (!result || !result.ok) {
        setError(result && !result.ok ? result.error : "The CV could not be uploaded. Please try again.");
        return;
      }
      setDone(true);
      setFile(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setError("We could not reach our server. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2" aria-describedby={error ? `${id}-error` : `${id}-hint`} data-testid="attach-cv-form">
      <label htmlFor={`${id}-file`} className="text-sm font-medium text-foreground">
        {replace ? "Replace the CV" : "Got the CV on WhatsApp? Attach it here"}
      </label>
      <input
        ref={input}
        id={`${id}-file`}
        type="file"
        accept={CV_ACCEPT}
        disabled={busy}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError(null);
          setDone(false);
        }}
        className="block w-full rounded-lg border border-input bg-white p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-navy file:px-4 file:font-medium file:text-white"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {CV_TYPES_LABEL}, up to 4 MB. Large photos are made smaller automatically.
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="rounded-lg border border-destructive/40 bg-danger-soft p-3 text-sm text-danger-strong">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" disabled={busy} className="min-h-11 w-full sm:w-auto">
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
        {replace ? "Upload new CV" : "Attach CV"}
      </Button>
      <p aria-live="polite" className="text-sm text-success-strong">
        {done ? "CV attached." : ""}
      </p>
    </form>
  );
}
