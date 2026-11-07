"use client";

import { UploadCloud } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { FilePurpose, FileVisibility } from "@/db/schema/_constants";
import { useT } from "@/i18n/client";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getClientFilePolicy, isRasterImageMime, precheckFile } from "@/modules/files/policies";
import type { FileSummary, UploadedFile } from "@/modules/files/types";

import { interpolate } from "./file-meta";
import { FileUploadItem, type UploadItem } from "./file-upload-item";
import { startUpload, UploadRequestError, type UploadHandle } from "./upload-client";

/**
 * Drag-and-drop / click file upload bound to a purpose. Files upload immediately (XHR with progress)
 * to POST /api/v1/uploads; the form receives the resulting file ids in hidden inputs:
 *   single:   <input type="hidden" name={name} value="<id>">
 *   multiple: <input type="hidden" name="{name}[]" value="<id>"> per file (an empty one when none)
 * Server actions must validate ids with requireUploadedFile() before linking them.
 *
 * Text is English by default; inside <I18nProvider> it uses `common` keys "files.<key>" when present
 * (see DEFAULT_MESSAGES), and `messages` overrides both.
 */
export const DEFAULT_MESSAGES = {
  choose: "Choose file",
  chooseMultiple: "Choose files",
  dropHint: "or drag and drop it here",
  dropHintMultiple: "or drag and drop them here",
  dropActive: "Drop to upload",
  constraints: "{types}, up to {size}",
  constraintsMultiple: "{types}, up to {size} each, {count} files maximum",
  uploading: "Uploading {name}",
  uploaded: "Uploaded",
  announceUploaded: "{name} uploaded",
  announceRemoved: "{name} removed",
  announceFailed: "{name} could not be uploaded: {error}",
  remove: "Remove {name}",
  cancel: "Cancel upload of {name}",
  scanPending: "Security check in progress",
  errorTooLarge: "This file is larger than {size}.",
  errorType: "This file type is not accepted. Use {types}.",
  errorEmpty: "This file is empty.",
  errorTooMany: "You can upload up to {count} files.",
  errorNetwork: "Upload failed. Check your connection and try again.",
  errorGeneric: "Upload failed. Please try again.",
  waitForUpload: "Please wait until your files finish uploading.",
} as const;

export type FileUploadMessages = { [K in keyof typeof DEFAULT_MESSAGES]: string };

export type FileUploadProps = {
  purpose: FilePurpose;
  /** Form field name for the uploaded file id(s). */
  name: string;
  multiple?: boolean;
  /** Maximum files (default 1, or 10 when multiple). */
  maxFiles?: number;
  /** Upload on behalf of an organisation (org logos, documents, licences…). */
  organizationId?: string;
  visibility?: FileVisibility;
  /** Already-linked files (edit forms). */
  defaultFiles?: FileSummary[];
  label?: string;
  description?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** Mark invalid and point to the field error rendered by the form. */
  invalid?: boolean;
  errorId?: string;
  messages?: Partial<FileUploadMessages>;
  onChange?: (files: FileSummary[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
};

let keySeq = 0;
const nextKey = () => `upl-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;

const toSummary = (f: UploadedFile): FileSummary => ({
  id: f.id,
  name: f.name,
  size: f.size,
  mimeType: f.mimeType,
  url: f.url,
  thumbnailUrl: f.thumbnailUrl,
  width: f.width,
  height: f.height,
  scanStatus: f.scanStatus,
});

export function FileUpload(props: FileUploadProps) {
  const { purpose, name, multiple = false, organizationId, visibility, defaultFiles, label, description, required, disabled, invalid, errorId, className } = props;
  const policy = useMemo(() => getClientFilePolicy(purpose), [purpose]);
  const maxFiles = multiple ? Math.max(1, props.maxFiles ?? 10) : 1;
  const t = useT("common");
  const overrides = props.messages;
  const msg = useCallback(
    (key: keyof typeof DEFAULT_MESSAGES, vars?: Record<string, string | number>) => {
      if (overrides?.[key]) return interpolate(overrides[key]!, vars);
      const i18nKey = `files.${key}`;
      const translated = t(i18nKey, vars);
      return translated !== i18nKey ? translated : interpolate(DEFAULT_MESSAGES[key], vars);
    },
    [overrides, t],
  );

  const generatedId = useId();
  const inputId = props.id ?? `${generatedId}-input`;
  const labelId = `${generatedId}-label`;
  const hintId = `${generatedId}-hint`;

  const [items, setItems] = useState<UploadItem[]>(() => (defaultFiles ?? []).map((file) => ({ key: nextKey(), status: "done", file, previewUrl: null })));
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const uploads = useRef(new Map<string, UploadHandle>());
  const objectUrls = useRef(new Map<string, string>());
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const done = items.filter((i): i is Extract<UploadItem, { status: "done" }> => i.status === "done").map((i) => i.file);
  const uploading = items.some((i) => i.status === "uploading");

  const { onChange, onUploadingChange } = props;
  const doneIds = done.map((f) => f.id).join(",");
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    onChange?.(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify only when the set of uploaded ids changes
  }, [doneIds]);
  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  // Block the surrounding form from submitting while uploads are still running.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form || !uploading) return;
    const block = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setAnnouncement(msg("waitForUpload"));
    };
    form.addEventListener("submit", block, true);
    return () => form.removeEventListener("submit", block, true);
  }, [uploading, msg]);

  // Abort uploads and release object URLs on unmount.
  useEffect(() => {
    const active = uploads.current;
    const urls = objectUrls.current;
    return () => {
      active.forEach((u) => u.abort());
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const releasePreview = (key: string) => {
    const url = objectUrls.current.get(key);
    if (url) URL.revokeObjectURL(url);
    objectUrls.current.delete(key);
  };

  const errorText = useCallback(
    (error: unknown) => {
      if (error instanceof UploadRequestError) {
        if (error.code === "network") return msg("errorNetwork");
        if (error.message) return error.message;
      }
      return msg("errorGeneric");
    },
    [msg],
  );

  const upload = (file: File) => {
    const key = nextKey();
    const precheck = precheckFile(policy, file);
    const previewUrl = isRasterImageMime(file.type) && !precheck ? URL.createObjectURL(file) : null;
    if (previewUrl) objectUrls.current.set(key, previewUrl);
    if (precheck) {
      const error =
        precheck === "too_large" ? msg("errorTooLarge", { size: formatFileSize(policy.maxBytes) }) : precheck === "empty" ? msg("errorEmpty") : msg("errorType", { types: policy.typesLabel });
      setItems((prev) => [...prev, { key, status: "error", name: file.name, size: file.size, mimeType: file.type, error, previewUrl: null }]);
      setAnnouncement(msg("announceFailed", { name: file.name, error }));
      return;
    }
    const handle = startUpload(file, {
      purpose,
      organizationId,
      visibility,
      onProgress: (progress) => setItems((prev) => prev.map((i) => (i.key === key && i.status === "uploading" ? { ...i, progress } : i))),
    });
    uploads.current.set(key, handle);
    setItems((prev) => [...prev, { key, status: "uploading", name: file.name, size: file.size, mimeType: file.type, progress: 0, previewUrl }]);
    handle.promise
      .then((result) => {
        setItems((prev) => prev.map((i) => (i.key === key ? { key, status: "done", file: toSummary(result), previewUrl } : i)));
        setAnnouncement(msg("announceUploaded", { name: result.name }));
      })
      .catch((error: unknown) => {
        if (error instanceof UploadRequestError && error.code === "aborted") return;
        const text = errorText(error);
        setItems((prev) => prev.map((i) => (i.key === key ? { key, status: "error", name: file.name, size: file.size, mimeType: file.type, error: text, previewUrl } : i)));
        setAnnouncement(msg("announceFailed", { name: file.name, error: text }));
      })
      .finally(() => uploads.current.delete(key));
  };

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (!incoming.length || disabled) return;
    if (!multiple) {
      // Single mode: a new file replaces the current one.
      items.forEach((i) => removeItem(i.key, { silent: true }));
      upload(incoming[0]!);
      return;
    }
    const slots = maxFiles - items.filter((i) => i.status !== "error").length;
    if (incoming.length > slots) setAnnouncement(msg("errorTooMany", { count: maxFiles }));
    incoming.slice(0, Math.max(0, slots)).forEach(upload);
  };

  const removeItem = (key: string, opts: { silent?: boolean } = {}) => {
    uploads.current.get(key)?.abort();
    uploads.current.delete(key);
    releasePreview(key);
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item && !opts.silent) setAnnouncement(msg("announceRemoved", { name: item.status === "done" ? item.file.name : item.name }));
      return prev.filter((i) => i.key !== key);
    });
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  };

  const constraints = multiple
    ? msg("constraintsMultiple", { types: policy.typesLabel, size: formatFileSize(policy.maxBytes), count: maxFiles })
    : msg("constraints", { types: policy.typesLabel, size: formatFileSize(policy.maxBytes) });
  const full = multiple && items.filter((i) => i.status !== "error").length >= maxFiles;

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-2", className)} role="group" aria-labelledby={label ? labelId : undefined}>
      {label ? (
        <span id={labelId} className="text-sm font-medium text-foreground">
          {label}
          {required ? <span aria-hidden="true" className="text-danger"> *</span> : null}
        </span>
      ) : null}
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (disabled || full) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors sm:flex-row sm:text-left",
          dragging ? "border-teal bg-teal-soft" : "border-border bg-surface-subtle",
          invalid && "border-danger",
          (disabled || full) && "opacity-60",
        )}
      >
        <UploadCloud aria-hidden="true" className="size-8 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-start">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              className="peer sr-only"
              accept={policy.accept}
              multiple={multiple}
              disabled={disabled || full}
              aria-required={required || undefined}
              aria-invalid={invalid || undefined}
              aria-describedby={[hintId, invalid ? errorId : undefined].filter(Boolean).join(" ")}
              aria-label={label ? `${label}: ${multiple ? msg("chooseMultiple") : msg("choose")}` : undefined}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <label
              htmlFor={inputId}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted",
                "peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed",
              )}
            >
              {dragging ? msg("dropActive") : multiple ? msg("chooseMultiple") : msg("choose")}
            </label>
            <span className="text-sm text-muted-foreground">{multiple ? msg("dropHintMultiple") : msg("dropHint")}</span>
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {constraints}
          </p>
        </div>
      </div>

      {items.length ? (
        <ul className="flex flex-col gap-2" aria-label={label}>
          {items.map((item) => {
            const itemName = item.status === "done" ? item.file.name : item.name;
            return (
              <FileUploadItem
                key={item.key}
                item={item}
                disabled={disabled}
                onRemove={(key) => removeItem(key)}
                labels={{
                  remove: msg("remove", { name: itemName }),
                  cancel: msg("cancel", { name: itemName }),
                  uploading: msg("uploading", { name: itemName }),
                  uploaded: msg("uploaded"),
                  scanPending: msg("scanPending"),
                }}
              />
            );
          })}
        </ul>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {multiple ? (
        done.length ? (
          done.map((f) => <input key={f.id} type="hidden" name={`${name}[]`} value={f.id} />)
        ) : (
          <input type="hidden" name={`${name}[]`} value="" />
        )
      ) : (
        <input type="hidden" name={name} value={done[0]?.id ?? ""} />
      )}
    </div>
  );
}
