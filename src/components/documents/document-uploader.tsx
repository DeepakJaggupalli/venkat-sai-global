"use client";

import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { shrinkImageIfNeeded } from "./shrink-image";

export type DocumentKindOption = { value: string; label: string; hint?: string };

type Uploaded = { key: string; kindLabel: string; fileName: string };

const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Upload documents ONE FILE AT A TIME (kind + file), so no request comes near the 4.5 MB body limit. Large photos are
 * shrunk in the browser first. Used by the candidate's signed upload page (`fields.token`) and by staff on the CV
 * submission page (`refreshOnUpload`). The endpoint answers with ActionResult JSON.
 */
export function DocumentUploader({
  endpoint,
  kinds,
  fields = {},
  maxBytes,
  accept,
  typesLabel,
  refreshOnUpload = false,
  className,
}: {
  endpoint: string;
  kinds: DocumentKindOption[];
  fields?: Record<string, string>;
  maxBytes: number;
  accept: string;
  typesLabel: string;
  refreshOnUpload?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(kinds[0]?.value ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Uploaded[]>([]);
  const hint = kinds.find((k) => k.value === kind)?.hint;
  const maxMb = Math.floor(maxBytes / (1024 * 1024));

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a file to upload.");
      fileInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const prepared = await shrinkImageIfNeeded(file, { maxBytes });
      if (prepared.size > maxBytes) {
        setError(`This file is larger than ${maxMb} MB. Take a photo of the page instead, or choose a smaller file.`);
        return;
      }
      const data = new FormData();
      for (const [name, value] of Object.entries(fields)) data.set(name, value);
      data.set("kind", kind);
      data.set("file", prepared, prepared.name);
      const response = await fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const result = (await response.json().catch(() => null)) as ActionResult<unknown> | null;
      if (!result || !result.ok) {
        setError(result && !result.ok ? result.error : response.status === 413 ? `This file is larger than ${maxMb} MB.` : "The file could not be uploaded. Please try again.");
        return;
      }
      setDone((list) => [...list, { key: `${Date.now()}-${list.length}`, kindLabel: kinds.find((k) => k.value === kind)?.label ?? kind, fileName: prepared.name }]);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      if (refreshOnUpload) router.refresh();
    } catch {
      setError("We could not reach our server. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={error ? `${id}-error` : undefined}>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-kind`}>Type of document</Label>
          <select id={`${id}-kind`} className={SELECT} value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-file`}>File</Label>
          <input
            ref={fileInput}
            id={`${id}-file`}
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="block w-full rounded-lg border border-input bg-white p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-navy file:px-4 file:font-medium file:text-white"
          />
          <p className="text-sm text-muted-foreground">
            {typesLabel}, one file at a time, up to {maxMb} MB. Large photos are made smaller automatically.
          </p>
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert" className="rounded-lg border border-destructive/40 bg-danger-soft p-3 text-sm text-danger-strong">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="min-h-12 w-full text-base sm:w-auto">
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
          {busy ? "Uploading…" : "Upload this document"}
        </Button>
      </form>
      <div aria-live="polite">
        {done.length ? (
          <ul className="space-y-2" data-testid="uploaded-documents">
            {done.map((d) => (
              <li key={d.key} className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-soft p-3 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden="true" />
                <span>
                  <span className="font-medium">{d.kindLabel}</span> uploaded: <span className="break-all">{d.fileName}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
