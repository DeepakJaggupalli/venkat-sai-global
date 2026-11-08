"use client";

import { CheckCircle2, ExternalLink, ImagePlus, Loader2, MessageCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, type ChangeEvent } from "react";

import { startUpload } from "@/components/files/upload-client";
import { FormErrorAlert, FormField, fieldErrorsFor } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import type { QuickPosterResult } from "@/modules/recruitment-posters/service";

import { quickPublishPosterAction } from "../actions";

type Option = { value: string; label: string };
type Draft = { id: string; previewUrl: string; name: string };

/** Phone photos can be 5–10 MB; requests to Vercel functions are capped at 4.5 MB, so larger images are resized. */
const RESIZE_ABOVE_BYTES = 3.5 * 1024 * 1024;
const MAX_SIDE = 2560;

async function shrinkImage(file: File): Promise<File> {
  if (file.size <= RESIZE_ABOVE_BYTES || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** The shared WhatsApp text often starts with the headline; use its first line as a title suggestion. */
function firstLine(text: string | null): string {
  return (text ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 200) ?? "";
}

type FormProps = {
  countries: Option[];
  defaultTitle: string;
  canPublish: boolean;
  draft: Draft | null;
  sharedTitle: string | null;
  sharedText: string | null;
};

/** "Post another" remounts the form (fresh action state) and drops a ?file= share prefill from the URL. */
export function PosterPublishForm(props: FormProps) {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const first = round === 0;
  return (
    <PosterForm
      key={round}
      {...props}
      draft={first ? props.draft : null}
      sharedTitle={first ? props.sharedTitle : null}
      sharedText={first ? props.sharedText : null}
      onReset={() => {
        setRound((r) => r + 1);
        router.replace("/admin/requirements/posters/new");
      }}
    />
  );
}

function PosterForm({ countries, defaultTitle, canPublish, draft, sharedTitle, sharedText, onReset }: FormProps & { onReset: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState<QuickPosterResult>, FormData>(quickPublishPosterAction, null);
  const [uploaded, setUploaded] = useState<Draft | null>(draft);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (state?.ok && state.data) {
    const result = state.data;
    const live = result.outcome?.outcome === "published";
    const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/requirements/${result.slug}` : `/requirements/${result.slug}`;
    return (
      <div role="status" aria-live="polite" className="space-y-4 rounded-2xl border border-success/40 bg-success-soft p-5" data-testid="poster-published">
        <CheckCircle2 className="size-9 text-success-strong" aria-hidden="true" />
        <p className="font-heading text-xl font-semibold text-navy">{state.message}</p>
        <div className="flex flex-col gap-3">
          {live ? (
            <>
              <Link href={`/requirements/${result.slug}`} target="_blank" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-navy px-5 text-base font-semibold text-white hover:bg-navy-deep">
                <ExternalLink className="size-5" aria-hidden="true" />
                View on the website
              </Link>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`New requirement: ${publicUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 text-base font-semibold text-navy-deep hover:bg-[#1fbd5a]"
              >
                <MessageCircle className="size-5" aria-hidden="true" />
                Share the link on WhatsApp
              </a>
            </>
          ) : null}
          <Link href={`/admin/content/requirement_posts/${result.entryId}`} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-navy/20 bg-white px-5 text-base font-semibold text-navy hover:bg-surface-subtle">
            Edit details
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-navy/20 bg-white px-5 text-base font-semibold text-navy hover:bg-surface-subtle"
          >
            <RotateCcw className="size-5" aria-hidden="true" />
            Post another
          </button>
        </div>
      </div>
    );
  }

  const onChoose = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setUploadError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(chosen.type) && !/\.(jpe?g|png|webp)$/i.test(chosen.name)) {
      setUploadError("Choose a JPG, PNG or WebP image of the poster.");
      return;
    }
    setUploaded(null);
    setLocalPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(chosen);
    });
    setProgress(0);
    try {
      const file = await shrinkImage(chosen);
      const result = await startUpload(file, { purpose: "cms_media", visibility: "private", onProgress: setProgress }).promise;
      setUploaded({ id: result.id, previewUrl: result.thumbnailUrl ?? result.url, name: result.name });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The photo could not be uploaded. Check your connection and try again.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const uploading = progress !== null;
  const preview = localPreview ?? uploaded?.previewUrl ?? null;
  const fileErrors = uploadError ? [uploadError] : fieldErrorsFor(state, "fileId");

  return (
    <form action={formAction} className="space-y-5" data-testid="poster-form">
      <FormErrorAlert state={state} />
      <input type="hidden" name="fileId" value={uploaded?.id ?? ""} />

      <div className="space-y-2">
        <label
          htmlFor="poster-photo"
          className={cn(
            "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-navy/30 bg-surface-subtle p-4 text-center hover:border-navy/60 focus-within:ring-3 focus-within:ring-ring/50",
            fileErrors?.length ? "border-destructive" : null,
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview (blob:) or private staff thumbnail
            <img src={preview} alt="Chosen poster" className="max-h-80 w-auto rounded-lg object-contain" />
          ) : (
            <ImagePlus className="size-12 text-navy" aria-hidden="true" />
          )}
          <span className="inline-flex min-h-12 items-center rounded-lg bg-navy px-6 text-lg font-semibold text-white">{preview ? "Choose a different photo" : "Choose photo"}</span>
          <span className="text-sm text-muted-foreground">From your gallery, WhatsApp images or the camera</span>
        </label>
        <input id="poster-photo" ref={inputRef} type="file" accept="image/*" onChange={onChoose} className="sr-only" data-testid="poster-input" aria-describedby={fileErrors?.length ? "poster-photo-error" : undefined} />
        {uploading ? (
          <p className="flex items-center gap-2 text-sm text-foreground" aria-live="polite">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Uploading {progress}%
          </p>
        ) : uploaded ? (
          <p className="text-sm text-success-strong" aria-live="polite" data-testid="poster-uploaded">
            Photo ready.
          </p>
        ) : null}
        {fileErrors?.length ? (
          <p id="poster-photo-error" className="text-sm font-medium text-danger-strong">
            {fileErrors[0]}
          </p>
        ) : null}
      </div>

      <FormField label="Title" name="title" optional state={state} hint={`Leave empty to use "${defaultTitle}".`}>
        <Input defaultValue={sharedTitle ?? firstLine(sharedText)} maxLength={200} placeholder="Dubai - Mechanical helper" className="h-12 text-base" />
      </FormField>

      <FormField label="Country" name="countryCode" optional state={state}>
        <select className={SELECT} defaultValue="">
          <option value="">Not specified</option>
          {countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Trades" name="trades" optional state={state} hint="One per line. Add the salary after a dash, for example: Mechanical helper - 900 AED">
        <Textarea rows={3} className="text-base" />
      </FormField>

      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer text-base font-medium text-navy">More details (optional)</summary>
        <div className="mt-4 space-y-5">
          <FormField label="Company name" name="companyName" optional state={state} hint="Only if the employer allows its name to be shown.">
            <Input maxLength={160} className="h-12 text-base" />
          </FormField>
          <FormField label="Benefits" name="benefits" optional state={state} hint="One per line, for example: Free accommodation">
            <Textarea rows={3} className="text-base" />
          </FormField>
          <FormField label="Short description" name="description" optional state={state}>
            <Textarea rows={4} maxLength={2000} defaultValue={sharedText ?? ""} className="text-base" />
          </FormField>
          <FormField label="Apply by" name="applyBy" optional state={state}>
            <Input type="date" className="h-12 text-base" />
          </FormField>
        </div>
      </details>

      <button
        type="submit"
        disabled={pending || uploading || !uploaded}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-navy px-6 text-lg font-semibold text-white hover:bg-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
        data-testid="poster-publish"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Publishing..." : canPublish ? "Publish now" : "Send for approval"}
      </button>
      {!uploaded && !uploading ? <p className="text-center text-sm text-muted-foreground">Choose the poster photo first.</p> : null}
    </form>
  );
}
