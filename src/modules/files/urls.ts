/**
 * File URLs (pure, client-safe).
 *
 *  - public files:  /media/<id>/<safe-name>[?variant=thumb|md|lg][&download=1]   (long immutable cache)
 *  - private files: /api/v1/files/<id>[?variant=…][&download=1]                 (access-checked)
 *
 * URLs are relative; wrap with absoluteUrl() (src/lib/env) for emails.
 */
import { safeFileName } from "./keys";
import { IMAGE_VARIANT_SIZES, IMAGE_VARIANTS, isRasterImageMime, type ImageVariantName } from "./policies";
import type { FileRow, FileVariantMap } from "./types";

export type FileUrlInput = Pick<FileRow, "id" | "visibility" | "originalName" | "mimeType"> & { variants?: FileVariantMap | null };

export type FileUrlOptions = {
  /** Image variant (ignored for non-images). Falls back to the best available size on the server. */
  variant?: ImageVariantName;
  /** Force a download (Content-Disposition: attachment). */
  download?: boolean;
};

export function fileUrl(file: FileUrlInput, opts: FileUrlOptions = {}): string {
  const params = new URLSearchParams();
  const variant = opts.variant && isRasterImageMime(file.mimeType) ? opts.variant : undefined;
  if (variant) params.set("variant", variant);
  if (opts.download) params.set("download", "1");
  const query = params.toString();
  const qs = query ? `?${query}` : "";
  if (file.visibility === "public") {
    return `/media/${file.id}/${encodeURIComponent(safeFileName(file.originalName, variant ? "webp" : undefined))}${qs}`;
  }
  return `/api/v1/files/${file.id}${qs}`;
}

/** Thumbnail URL for raster images (null for other types). */
export function thumbnailUrl(file: FileUrlInput): string | null {
  return isRasterImageMime(file.mimeType) ? fileUrl(file, { variant: "thumb" }) : null;
}

/**
 * The variant actually served for a request: the requested one when it exists, otherwise the
 * largest generated variant below it (small originals skip big variants), otherwise null (serve
 * the original).
 */
export function resolveVariant(variants: FileVariantMap | null | undefined, requested: ImageVariantName | null | undefined): ImageVariantName | null {
  if (!requested || !variants) return null;
  if (variants[requested]) return requested;
  const below = IMAGE_VARIANTS.filter((v) => IMAGE_VARIANT_SIZES[v] < IMAGE_VARIANT_SIZES[requested] && variants[v]);
  return below.length ? below[below.length - 1]! : null;
}

export function parseVariantParam(value: string | null | undefined): ImageVariantName | null {
  return value && (IMAGE_VARIANTS as readonly string[]).includes(value) ? (value as ImageVariantName) : null;
}
