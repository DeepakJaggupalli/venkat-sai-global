import "server-only";

import { MIME_LABELS, isAllowedMimeType, isRasterImageMime } from "@/modules/files/policies";
import { getSharedUpload } from "@/modules/files/shared-uploads";

import type { SharedFileView } from "./shared-file-card";

/**
 * The file a visitor shared to the site (?shared=<token> or ?t=<token>), ready for display: null when no token was
 * given, `expired` when a token was given but is invalid, expired or already used.
 */
export async function loadSharedFile(token: string | undefined | null): Promise<{ file: SharedFileView | null; expired: boolean }> {
  if (!token) return { file: null, expired: false };
  const shared = await getSharedUpload(token).catch(() => null);
  if (!shared) return { file: null, expired: true };
  const { file } = shared;
  const isImage = isRasterImageMime(file.mimeType);
  return {
    file: {
      token,
      name: file.originalName,
      size: file.sizeBytes,
      mimeType: file.mimeType,
      typeLabel: isAllowedMimeType(file.mimeType) ? MIME_LABELS[file.mimeType] : "File",
      isImage,
      previewUrl: isImage ? `/share/file?t=${encodeURIComponent(token)}` : null,
      sharedText: shared.sharedText,
    },
    expired: false,
  };
}
