/**
 * Storage keys, safe file names and Content-Disposition values (pure, client-safe).
 */
import { fileExtension, IMAGE_VARIANTS, type ImageVariantName } from "./policies";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Sharded object key: `yyyy/mm/<uuid>` (UTC). The uuid is the files.id, so keys never collide and
 * the object behind a row is easy to find. Variants live next to it (see variantStorageKey).
 */
export function generateStorageKey(fileId: string, now: Date = new Date()): string {
  if (!UUID_RE.test(fileId)) throw new Error("generateStorageKey: fileId must be a lower-case UUID");
  const yyyy = now.getUTCFullYear().toString().padStart(4, "0");
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${yyyy}/${mm}/${fileId}`;
}

/** Key of a WebP image variant: `yyyy/mm/<uuid>.<variant>.webp`. */
export function variantStorageKey(key: string, variant: ImageVariantName): string {
  return `${key}.${variant}.webp`;
}

const KEY_RE = new RegExp(`^\\d{4}/\\d{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\\.(${IMAGE_VARIANTS.join("|")})\\.webp)?$`);

/** Only keys produced by this module are valid (also blocks path traversal in the local driver). */
export function isValidStorageKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Normalise a user-supplied original name for storage/display: strips paths and control
 * characters, collapses whitespace, caps the length (keeping the extension).
 */
export function normalizeOriginalName(name: string | null | undefined, fallback = "file"): string {
  const raw = (name ?? "").split(/[\\/]/).pop() ?? "";
  let cleaned = raw.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/^\.+/, "");
  if (!cleaned) cleaned = fallback;
  if (cleaned.length > 180) {
    const ext = fileExtension(cleaned);
    const keep = ext ? 180 - ext.length - 1 : 180;
    cleaned = ext ? `${cleaned.slice(0, keep)}.${ext}` : cleaned.slice(0, keep);
  }
  return cleaned;
}

/**
 * URL/header-safe ASCII file name ("Résumé 2026 (final).PDF" → "resume-2026-final.pdf").
 * `forcedExtension` replaces the extension (e.g. "webp" for image variants).
 */
export function safeFileName(name: string | null | undefined, forcedExtension?: string): string {
  const original = normalizeOriginalName(name);
  const ext = (forcedExtension ?? fileExtension(original)).toLowerCase().replace(/[^a-z0-9]/g, "");
  const stem = fileExtension(original) ? original.slice(0, original.length - fileExtension(original).length - 1) : original;
  let slug = stem
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[-.]{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 80)
    .replace(/[-._]+$/g, "");
  if (!slug || WINDOWS_RESERVED.test(slug)) slug = slug ? `file-${slug}` : "file";
  return ext ? `${slug}.${ext}` : slug;
}

/** Ensure a display/download name carries the given extension (e.g. sniffed type differs). */
export function withExtension(name: string, extension: string): string {
  const ext = fileExtension(name);
  if (ext === extension.toLowerCase()) return name;
  const stem = ext ? name.slice(0, name.length - ext.length - 1) : name;
  return `${stem || "file"}.${extension.toLowerCase()}`;
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 `filename*`.
 * Quotes, backslashes and control characters can never reach the header.
 */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const normalized = normalizeOriginalName(filename);
  const ascii = safeFileName(normalized);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(normalized)}`;
}
