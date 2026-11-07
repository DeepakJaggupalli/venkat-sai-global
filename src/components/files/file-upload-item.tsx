"use client";

import { AlertCircle, CheckCircle2, ShieldEllipsis, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { FileSummary } from "@/modules/files/types";

import { FilePreview } from "./file-preview";

export type UploadItem =
  | { key: string; status: "uploading"; name: string; size: number; mimeType: string; progress: number; previewUrl: string | null }
  | { key: string; status: "done"; file: FileSummary; previewUrl: string | null }
  | { key: string; status: "error"; name: string; size: number; mimeType: string; error: string; previewUrl: string | null };

type Props = {
  item: UploadItem;
  disabled?: boolean;
  onRemove: (key: string) => void;
  labels: { remove: string; cancel: string; uploading: string; uploaded: string; scanPending: string };
};

/** One row of the <FileUpload> list: preview, name/size, progress or status, remove/cancel button. */
export function FileUploadItem({ item, disabled, onRemove, labels }: Props) {
  const summary =
    item.status === "done"
      ? { ...item.file, thumbnailUrl: item.previewUrl ?? item.file.thumbnailUrl ?? null }
      : { name: item.name, size: item.size, mimeType: item.mimeType, url: item.previewUrl ?? "", thumbnailUrl: item.previewUrl };

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border bg-background p-2.5 sm:flex-nowrap",
        item.status === "error" && "border-danger/40 bg-danger-soft",
      )}
    >
      <FilePreview file={summary} size="sm" className="min-w-0 flex-1" />

      <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
        {item.status === "uploading" ? (
          <div className="w-full sm:w-32">
            <Progress value={item.progress} aria-label={labels.uploading} />
            <span className="mt-1 block text-xs text-muted-foreground tabular-nums" aria-hidden="true">
              {item.progress}%
            </span>
          </div>
        ) : null}
        {item.status === "done" && item.file.scanStatus === "pending" ? (
          <span className="inline-flex items-center gap-1 text-xs text-warning">
            <ShieldEllipsis aria-hidden="true" className="size-3.5" />
            {labels.scanPending}
          </span>
        ) : null}
        {item.status === "done" && item.file.scanStatus !== "pending" ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            <span className="sr-only sm:not-sr-only">{labels.uploaded}</span>
          </span>
        ) : null}
        {item.status === "error" ? (
          <span className="inline-flex items-start gap-1 text-xs text-danger">
            <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {item.error}
          </span>
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="ml-auto shrink-0"
        onClick={() => onRemove(item.key)}
        disabled={disabled && item.status !== "uploading"}
        aria-label={item.status === "uploading" ? labels.cancel : labels.remove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}
