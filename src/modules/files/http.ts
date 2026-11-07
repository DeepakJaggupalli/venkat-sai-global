import "server-only";

import { contentDisposition, withExtension } from "./keys";
import { MIME, MIME_EXTENSIONS, isAllowedMimeType } from "./policies";

/**
 * HTTP helpers shared by GET /api/v1/files/[id] and GET /media/[id]/[name].
 */

/** Types a browser may render inline from our origin (everything else is always a download). */
const INLINE_TYPES = new Set<string>([MIME.jpeg, MIME.png, MIME.webp, MIME.svg, MIME.pdf]);

export function isInlineSafe(mimeType: string): boolean {
  return INLINE_TYPES.has(mimeType);
}

/**
 * Files are rendered in a locked-down document: no scripts, no plugins, no network (`sandbox`).
 * PDFs are the exception — Chromium's PDF viewer refuses to run inside a sandboxed document —
 * and are protected by their exact Content-Type + nosniff instead.
 */
const FILE_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";

export type FileHeaderOptions = {
  mimeType: string;
  size: number | null;
  fileName: string;
  download: boolean;
  cacheControl: string;
  etag?: string | null;
  /** Private files must not be embeddable cross-origin. */
  crossOriginResourcePolicy: "same-origin" | "cross-origin";
  noIndex: boolean;
};

export function buildFileHeaders(opts: FileHeaderOptions): Headers {
  const headers = new Headers();
  const inline = !opts.download && isInlineSafe(opts.mimeType);
  const ext = isAllowedMimeType(opts.mimeType) ? MIME_EXTENSIONS[opts.mimeType][0] : undefined;
  const name = ext ? withExtension(opts.fileName, ext) : opts.fileName;
  headers.set("Content-Type", opts.mimeType.startsWith("text/") || opts.mimeType === MIME.json ? `${opts.mimeType}; charset=utf-8` : opts.mimeType);
  if (opts.size !== null) headers.set("Content-Length", String(opts.size));
  headers.set("Content-Disposition", contentDisposition(inline ? "inline" : "attachment", name));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", opts.cacheControl);
  headers.set("Cross-Origin-Resource-Policy", opts.crossOriginResourcePolicy);
  if (opts.mimeType !== MIME.pdf) headers.set("Content-Security-Policy", FILE_CSP);
  if (opts.etag) headers.set("ETag", opts.etag);
  if (opts.noIndex) headers.set("X-Robots-Tag", "noindex, nofollow");
  return headers;
}

export function notModified(request: Request, etag: string | null | undefined): boolean {
  if (!etag) return false;
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .some((t) => t === etag || t === "*");
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
