/**
 * Browser upload helper for POST /api/v1/uploads (XMLHttpRequest for progress events).
 */
import type { FilePurpose, FileVisibility } from "@/db/schema/_constants";
import type { UploadedFile } from "@/modules/files/types";

export class UploadRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "UploadRequestError";
    this.status = status;
    this.code = code;
  }
}

export type UploadOptions = {
  purpose: FilePurpose;
  organizationId?: string;
  visibility?: FileVisibility;
  onProgress?: (percent: number) => void;
};

export type UploadHandle = { promise: Promise<UploadedFile>; abort: () => void };

export function startUpload(file: File, opts: UploadOptions): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadedFile>((resolve, reject) => {
    const form = new FormData();
    form.append("purpose", opts.purpose);
    if (opts.organizationId) form.append("organizationId", opts.organizationId);
    if (opts.visibility) form.append("visibility", opts.visibility);
    form.append("file", file, file.name);

    xhr.open("POST", `/api/v1/uploads?purpose=${encodeURIComponent(opts.purpose)}`);
    xhr.responseType = "json";
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) opts.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      const body = (xhr.response ?? null) as (UploadedFile & { error?: string; code?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body.id === "string") {
        opts.onProgress?.(100);
        resolve(body);
        return;
      }
      reject(new UploadRequestError(body?.error ?? "", xhr.status, body?.code ?? null));
    };
    xhr.onerror = () => reject(new UploadRequestError("", 0, "network"));
    xhr.ontimeout = () => reject(new UploadRequestError("", 0, "network"));
    xhr.onabort = () => reject(new UploadRequestError("", 0, "aborted"));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
