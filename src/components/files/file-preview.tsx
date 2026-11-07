import { File, FileArchive, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import Image from "next/image";

import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FileSummary } from "@/modules/files/types";

import { fileTypeLabel, isPreviewableImage } from "./file-meta";

/**
 * Thumbnail (images) or type icon (documents) with optional name, type and size.
 * Works in server and client components. Pass a FileSummary (toFileSummary() on the server).
 */
export type FilePreviewProps = {
  file: Pick<FileSummary, "name" | "mimeType" | "size" | "url"> & { thumbnailUrl?: string | null };
  /** Thumbnail edge: sm 40px, md 64px, lg 96px. */
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  className?: string;
};

const EDGE = { sm: 40, md: 64, lg: 96 } as const;

function TypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const Icon = mimeType.includes("spreadsheet") || mimeType === "text/csv"
    ? FileSpreadsheet
    : mimeType.includes("presentation")
      ? Presentation
      : mimeType === "application/zip"
        ? FileArchive
        : mimeType === "application/pdf" || mimeType.includes("word") || mimeType.startsWith("text/")
          ? FileText
          : File;
  return <Icon aria-hidden="true" className={className} />;
}

export function FilePreview({ file, size = "md", showDetails = true, className }: FilePreviewProps) {
  const edge = EDGE[size];
  const imageSrc = isPreviewableImage(file.mimeType) ? (file.thumbnailUrl ?? file.url) : null;
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-surface-subtle text-muted-foreground"
        style={{ width: edge, height: edge }}
      >
        {imageSrc ? (
          <Image src={imageSrc} alt="" width={edge} height={edge} unoptimized className="size-full object-cover" />
        ) : (
          <TypeIcon mimeType={file.mimeType} className={size === "sm" ? "size-5" : "size-7"} />
        )}
      </div>
      {showDetails ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {fileTypeLabel(file.mimeType, file.name)}
            {typeof file.size === "number" ? ` · ${formatFileSize(file.size)}` : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
