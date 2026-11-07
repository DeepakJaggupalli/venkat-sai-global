import { Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DateText } from "./date-text";
import { EmptyState } from "./empty-state";

export type FileListItem = {
  id: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
  /** Download/view URL from the files module (private files go through the authorised route). */
  href?: string | null;
  uploadedAt?: Date | string | null;
  description?: ReactNode;
  /** Status element, e.g. <VerificationBadge state={doc.verificationStatus} /> or a scan status badge. */
  status?: ReactNode;
  /** Row actions (client buttons such as remove/replace). */
  actions?: ReactNode;
};

/** File-type icon and short label from a MIME type or file name (pure; exported for tests). */
export function fileKind(mimeType: string | null | undefined, name: string): { label: string; icon: LucideIcon } {
  const mime = (mimeType ?? "").toLowerCase();
  const ext = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  if (mime === "application/pdf" || ext === "pdf") return { label: "PDF", icon: FileText };
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "avif"].includes(ext)) return { label: ext ? ext.toUpperCase() : "Image", icon: FileImage };
  if (mime.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return { label: "Video", icon: FileVideo };
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv" || ["xls", "xlsx", "csv"].includes(ext)) return { label: ext ? ext.toUpperCase() : "Spreadsheet", icon: FileSpreadsheet };
  if (mime.includes("zip") || mime.includes("compressed") || ["zip", "rar", "7z"].includes(ext)) return { label: "Archive", icon: FileArchive };
  if (mime.includes("word") || mime.startsWith("text/") || ["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return { label: ext ? ext.toUpperCase() : "Document", icon: FileText };
  return { label: ext ? ext.toUpperCase() : "File", icon: File };
}

type FileListProps = {
  files: FileListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** Accessible name of the list, e.g. "Uploaded documents". */
  label?: string;
  timeZone?: string;
  className?: string;
};

/**
 * Attachment rows: type icon, name (download link), type · size · upload date, status and actions.
 *
 *   <FileList label="Documents" files={docs.map((d) => ({ id: d.id, name: d.title, size: d.size, mimeType: d.mime, href: fileUrl(d.fileId), status: <VerificationBadge state={d.verificationStatus} variant="inline" /> }))} />
 */
export function FileList({ files, emptyTitle = "No files yet", emptyDescription, label, timeZone, className }: FileListProps) {
  if (files.length === 0) {
    return <EmptyState variant="plain" size="sm" title={emptyTitle} description={emptyDescription} icon={<FileText />} className={className} />;
  }
  return (
    <ul aria-label={label} data-slot="file-list" className={cn("divide-y divide-border rounded-xl border border-border bg-card", className)}>
      {files.map((file) => {
        const kind = fileKind(file.mimeType, file.name);
        const Icon = kind.icon;
        const meta = [kind.label, file.size ? formatFileSize(file.size) : null].filter(Boolean).join(" · ");
        return (
          <li key={file.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-4">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-navy">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              {file.href ? (
                <a href={file.href} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:text-teal-strong hover:underline">
                  {file.name}
                  <span className="sr-only"> ({meta}, opens in a new tab)</span>
                </a>
              ) : (
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <span aria-hidden={file.href ? true : undefined}>{meta}</span>
                {file.uploadedAt ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Uploaded <DateText value={file.uploadedAt} timeZone={timeZone} />
                    </span>
                  </>
                ) : null}
              </p>
              {file.description ? <div className="mt-1 text-xs text-muted-foreground">{file.description}</div> : null}
            </div>
            {file.status ? <div className="shrink-0">{file.status}</div> : null}
            <div className="flex shrink-0 items-center gap-1">
              {file.actions}
              {file.href ? (
                <a
                  href={file.href}
                  download
                  aria-label={`Download ${file.name}`}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Download aria-hidden="true" className="size-4" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
