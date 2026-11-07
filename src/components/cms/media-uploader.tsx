"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { FileUpload } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { SubmitButton } from "@/components/shared/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { FileSummary } from "@/modules/files/types";
import { createMediaAssetAction } from "@/modules/content/actions";

type Details = { title: string; altText: string; decorative: boolean; people: "" | "yes" | "no"; credit: string };

export type MediaUploaderProps = {
  multiple?: boolean;
  folderId?: string | null;
  /** Called with the ids of the media items that were created. */
  onCreated?: (ids: string[]) => void;
  /** Shorter help for use inside the picker dialog. */
  compact?: boolean;
};

function titleFromName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 200) || "Untitled";
}

const isImage = (f: FileSummary) => f.mimeType.startsWith("image/");

/**
 * Upload one or more files into the media library (FileUpload purpose cms_media), then describe each
 * item: title, alt text (required for images unless decorative), whether identifiable people appear,
 * and the credit. Items showing people stay internal until their consent is recorded and approved.
 */
export function MediaUploader({ multiple = false, folderId, onCreated, compact = false }: MediaUploaderProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [details, setDetails] = useState<Record<string, Details>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestPublic, setRequestPublic] = useState(true);
  const [uploaderKey, setUploaderKey] = useState(0);

  function onFiles(next: FileSummary[]) {
    setFiles(next);
    setDetails((prev) => {
      const out: Record<string, Details> = {};
      for (const f of next) out[f.id] = prev[f.id] ?? { title: titleFromName(f.name), altText: "", decorative: false, people: "", credit: "" };
      return out;
    });
  }

  function patch(id: string, p: Partial<Details>) {
    setDetails((prev) => ({ ...prev, [id]: { ...prev[id]!, ...p } }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Keep the submit from bubbling (through the dialog portal) into a surrounding editor form.
    event.stopPropagation();
    if (busy || uploading || files.length === 0) return;
    const localErrors: Record<string, string> = {};
    for (const f of files) {
      const d = details[f.id]!;
      if (!d.title.trim()) localErrors[f.id] = "Enter a title.";
      else if (isImage(f) && !d.decorative && !d.altText.trim()) localErrors[f.id] = "Describe the image for people who cannot see it, or mark it as decorative.";
      else if (requestPublic && d.people === "") localErrors[f.id] = "Say whether identifiable people appear before asking for public use.";
    }
    setErrors(localErrors);
    if (Object.keys(localErrors).length) return;

    setBusy(true);
    const created: string[] = [];
    const failed: Record<string, string> = {};
    let needsConsent = 0;
    for (const f of files) {
      const d = details[f.id]!;
      const fd = new FormData();
      fd.set("fileId", f.id);
      fd.set("title", d.title.trim());
      if (d.altText.trim()) fd.set("altText", d.altText.trim());
      fd.set("decorative", d.decorative ? "true" : "false");
      if (d.credit.trim()) fd.set("credit", d.credit.trim());
      if (d.people) fd.set("showsIdentifiablePeople", d.people);
      if (folderId) fd.set("folderId", folderId);
      fd.set("visibility", requestPublic && d.people === "no" ? "public" : "internal");
      const result = await createMediaAssetAction(null, fd);
      if (result.ok && result.data) {
        created.push(result.data.id);
        if (d.people === "yes") needsConsent += 1;
      } else if (!result.ok) {
        failed[f.id] = Object.values(result.fieldErrors ?? {})[0]?.[0] ?? result.error;
      }
    }
    setBusy(false);
    setErrors(failed);
    if (created.length) {
      toast.success(created.length === 1 ? "Added to the media library." : `${created.length} items added to the media library.`);
      if (needsConsent) toast.info("Items showing people stay internal. Record their consent on each item, then request public use.");
      const remaining = files.filter((f) => failed[f.id]);
      setFiles(remaining);
      if (remaining.length === 0) setUploaderKey((k) => k + 1);
      onCreated?.(created);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FileUpload
        key={uploaderKey}
        purpose="cms_media"
        name={`media-upload-${uid}`}
        multiple={multiple}
        maxFiles={multiple ? 20 : 1}
        label={multiple ? "Files" : "File"}
        description={compact ? "JPG, PNG, WebP, SVG or PDF up to 20 MB." : "JPG, PNG, WebP, SVG or PDF up to 20 MB. Photos are stripped of location and camera data automatically."}
        onChange={onFiles}
        onUploadingChange={setUploading}
      />

      {files.length > 0 && (
        <div className="space-y-4">
          {files.map((f) => {
            const d = details[f.id];
            if (!d) return null;
            const base = `${uid}-${f.id.slice(0, 8)}`;
            return (
              <fieldset key={f.id} className="space-y-3 rounded-lg border p-4" aria-describedby={errors[f.id] ? `${base}-err` : undefined}>
                <legend className="px-1 text-sm font-medium">{f.name}</legend>
                {errors[f.id] && (
                  <p id={`${base}-err`} className="text-sm text-danger-strong" role="alert">
                    {errors[f.id]}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${base}-title`}>Title</Label>
                    <Input id={`${base}-title`} value={d.title} maxLength={200} onChange={(e) => patch(f.id, { title: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${base}-credit`}>Credit (optional)</Label>
                    <Input id={`${base}-credit`} value={d.credit} maxLength={200} placeholder="Photographer or source" onChange={(e) => patch(f.id, { credit: e.target.value })} />
                  </div>
                </div>
                {isImage(f) && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${base}-alt`}>Alt text</Label>
                    <Input
                      id={`${base}-alt`}
                      value={d.altText}
                      maxLength={300}
                      disabled={d.decorative}
                      aria-describedby={`${base}-alt-hint`}
                      onChange={(e) => patch(f.id, { altText: e.target.value })}
                    />
                    <p id={`${base}-alt-hint`} className="text-xs text-muted-foreground">
                      Describe what the image shows for people using screen readers, for example “Welder inspecting a pipe joint in the workshop”.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox id={`${base}-dec`} checked={d.decorative} onCheckedChange={(v) => patch(f.id, { decorative: v === true })} />
                      <Label htmlFor={`${base}-dec`} className="font-normal">
                        Decorative only (adds no information)
                      </Label>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium" id={`${base}-people`}>
                    Does it show identifiable people?
                  </p>
                  <RadioGroup aria-labelledby={`${base}-people`} value={d.people} onValueChange={(v) => patch(f.id, { people: v as Details["people"] })} className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id={`${base}-people-no`} />
                      <Label htmlFor={`${base}-people-no`} className="font-normal">
                        No
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id={`${base}-people-yes`} />
                      <Label htmlFor={`${base}-people-yes`} className="font-normal">
                        Yes, consent is needed
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </fieldset>
            );
          })}

          <div className="flex items-start gap-2">
            <Checkbox id={`${uid}-public`} checked={requestPublic} onCheckedChange={(v) => setRequestPublic(v === true)} />
            <Label htmlFor={`${uid}-public`} className="font-normal leading-snug">
              Make items without people available for the website. Items showing people stay internal until their consent is recorded and approved.
            </Label>
          </div>
          {!compact && (
            <Callout tone="info" title="Consent for photographs of people">
              Only publish photos of people who agreed to it. Record the signed release on the media item before asking for public use.
            </Callout>
          )}
          <SubmitButton pending={busy} pendingLabel="Adding…" disabled={uploading}>
            {files.length === 1 ? "Add to library" : `Add ${files.length} items to library`}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
