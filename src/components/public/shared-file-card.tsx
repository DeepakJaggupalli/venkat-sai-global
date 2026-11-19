import { FileText } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A file shared to the site from the phone (see loadSharedFile in ./shared-file.ts). Client-safe. */
export type SharedFileView = {
  token: string;
  name: string;
  size: number;
  mimeType: string;
  typeLabel: string;
  isImage: boolean;
  /** Token-protected thumbnail (/share/file) for images, else null. */
  previewUrl: string | null;
  /** Text shared with the file (WhatsApp message), if any. */
  sharedText: string | null;
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Thumbnail for images, an icon with the name for PDF / Word files. */
export function SharedFileCard({ file, label = "Your shared file", action, className }: { file: SharedFileView; label?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm", className)} data-testid="shared-file">
      {file.previewUrl ? (
        <Image src={file.previewUrl} alt="Preview of the photo you shared" width={96} height={96} unoptimized className="size-24 shrink-0 rounded-xl border border-border object-cover" />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface-subtle">
          <FileText className="size-8 text-foreground" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-base font-semibold text-foreground" data-testid="shared-file-name">
          {file.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {file.typeLabel}, {formatSize(file.size)}
        </p>
      </div>
      {action}
    </div>
  );
}
