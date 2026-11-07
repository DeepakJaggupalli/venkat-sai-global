import { Download, ExternalLink, Paperclip } from "lucide-react";

import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FileSummary } from "@/modules/files/types";

import { fileTypeLabel, withQuery } from "./file-meta";

/**
 * Link that opens (new tab) or downloads a file through its access-checked URL.
 * The accessible name includes the file type and size, and announces new-tab behaviour.
 */
export type FileLinkProps = {
  file: Pick<FileSummary, "name" | "mimeType" | "size" | "url">;
  /** Force a download instead of opening the file. */
  download?: boolean;
  /** Visible text (defaults to the file name). */
  children?: React.ReactNode;
  showMeta?: boolean;
  className?: string;
};

export function FileLink({ file, download = false, children, showMeta = true, className }: FileLinkProps) {
  const href = download ? withQuery(file.url, "download", "1") : file.url;
  const meta = [fileTypeLabel(file.mimeType, file.name), typeof file.size === "number" ? formatFileSize(file.size) : null].filter(Boolean).join(", ");
  const Icon = download ? Download : Paperclip;
  return (
    <a
      href={href}
      {...(download ? { download: file.name } : { target: "_blank", rel: "noopener noreferrer" })}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm font-medium text-teal-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{children ?? file.name}</span>
      {showMeta && meta ? <span className="shrink-0 font-normal text-muted-foreground">({meta})</span> : <span className="sr-only">({meta})</span>}
      {download ? null : (
        <>
          <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
          <span className="sr-only">(opens in a new tab)</span>
        </>
      )}
    </a>
  );
}
