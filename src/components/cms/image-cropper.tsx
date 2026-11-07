"use client";

import { useCallback, useId, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { toast } from "sonner";

import { startUpload } from "@/components/files/upload-client";
import { Callout } from "@/components/shared/callout";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createMediaAssetAction } from "@/modules/content/actions";

export type CropSource = {
  id: string;
  title: string;
  url: string;
  mimeType: string | null;
  altText: string | null;
  showsIdentifiablePeople: boolean | null;
  folderId?: string | null;
  credit?: string | null;
};

const ASPECTS = [
  { value: "16:9", label: "Wide 16:9 (banners, hero images)", ratio: 16 / 9 },
  { value: "4:3", label: "Standard 4:3", ratio: 4 / 3 },
  { value: "3:2", label: "Photo 3:2", ratio: 3 / 2 },
  { value: "1:1", label: "Square 1:1 (logos, team photos)", ratio: 1 },
  { value: "1.91:1", label: "Social sharing 1.91:1", ratio: 1.91 },
] as const;

export function canCrop(mimeType: string | null | undefined): boolean {
  return mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
}

async function cropToFile(src: string, area: Area, mimeType: string, name: string): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The image could not be loaded."));
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cropping is not supported in this browser.");
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const type = mimeType === "image/png" ? "image/png" : mimeType === "image/webp" ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error("The cropped image could not be created.");
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${name.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60) || "image"}-cropped.${ext}`, { type });
}

/**
 * Mount only while open (state starts fresh each time).
 * Crop an image into a NEW media item (the original stays untouched, so pages using it do not change).
 * Keyboard: focus the crop area and use the arrow keys to move it; the zoom slider changes the size.
 */
export function ImageCropper({
  source,
  open,
  onOpenChange,
  onCreated,
}: {
  source: CropSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]["value"]>("16:9");
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const onComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);
  const ratio = ASPECTS.find((a) => a.value === aspect)?.ratio ?? 16 / 9;

  async function save() {
    if (!area || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await cropToFile(source.url, area, source.mimeType ?? "image/jpeg", source.title);
      const uploaded = await startUpload(file, { purpose: "cms_media", onProgress: setProgress }).promise;
      const fd = new FormData();
      fd.set("fileId", uploaded.id);
      fd.set("title", `${source.title} (cropped ${aspect})`.slice(0, 200));
      if (source.altText) fd.set("altText", source.altText);
      fd.set("decorative", source.altText === "" ? "true" : "false");
      if (source.credit) fd.set("credit", source.credit);
      if (source.showsIdentifiablePeople !== null) fd.set("showsIdentifiablePeople", source.showsIdentifiablePeople ? "yes" : "no");
      if (source.folderId) fd.set("folderId", source.folderId);
      fd.set("visibility", source.showsIdentifiablePeople === false && source.altText !== null ? "public" : "internal");
      const result = await createMediaAssetAction(null, fd);
      if (!result.ok || !result.data) {
        setError(result.ok ? "The cropped image could not be saved." : (Object.values(result.fieldErrors ?? {})[0]?.[0] ?? result.error));
        return;
      }
      toast.success("Cropped copy added to the media library.");
      onCreated?.(result.data.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The cropped image could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Crop image"
      description="Cropping creates a new copy in the media library. The original and the pages using it stay unchanged."
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!area || busy} aria-disabled={!area || busy}>
            {busy ? (progress > 0 && progress < 100 ? `Uploading ${progress}%…` : "Saving…") : "Save cropped copy"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-aspect`}>Shape</Label>
          <select
            id={`${uid}-aspect`}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            value={aspect}
            onChange={(e) => setAspect(e.target.value as typeof aspect)}
          >
            {ASPECTS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="relative h-64 overflow-hidden rounded-lg bg-navy-deep sm:h-80">
          <Cropper
            image={source.url}
            crop={crop}
            zoom={zoom}
            aspect={ratio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
            keyboardStep={10}
            cropperProps={{ "aria-label": "Crop area. Use the arrow keys to move it." } as React.HTMLAttributes<HTMLDivElement>}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-zoom`}>Zoom</Label>
          <input
            id={`${uid}-zoom`}
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-[var(--color-teal)]"
            aria-valuetext={`${Math.round(zoom * 100)}%`}
          />
        </div>
        {source.showsIdentifiablePeople && (
          <Callout tone="warning" title="People are shown">
            The cropped copy starts as internal. Record the consent on the new item before asking for public use.
          </Callout>
        )}
        <div aria-live="polite">{error && <Callout tone="danger">{error}</Callout>}</div>
      </div>
    </ResponsiveDialog>
  );
}
