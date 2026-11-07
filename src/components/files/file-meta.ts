/**
 * Shared display helpers for file components (client-safe).
 */
import { isAllowedMimeType, isRasterImageMime, MIME_LABELS } from "@/modules/files/policies";

export function fileTypeLabel(mimeType: string, name?: string): string {
  if (isAllowedMimeType(mimeType)) return MIME_LABELS[mimeType];
  const ext = name?.split(".").pop();
  return ext && ext !== name ? ext.toUpperCase() : "File";
}

export function isPreviewableImage(mimeType: string): boolean {
  return isRasterImageMime(mimeType) || mimeType === "image/svg+xml";
}

/** Append a query parameter to a relative or absolute URL. */
export function withQuery(url: string, key: string, value: string): string {
  const [base, hash = ""] = url.split("#");
  const sep = base!.includes("?") ? "&" : "?";
  return `${base}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

/** Replace {placeholders} in a message. */
export function interpolate(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}
