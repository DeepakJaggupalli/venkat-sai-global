/**
 * Row → client DTO helpers (pure, client-safe). Pass these objects to client components
 * (<FileUpload defaultFiles>, <FilePreview>, <FileLink>) instead of raw rows.
 */
import type { FileRow, FileSummary, UploadedFile } from "./types";
import { fileUrl, thumbnailUrl } from "./urls";

type PresentableFile = Pick<FileRow, "id" | "visibility" | "originalName" | "mimeType" | "variants" | "sizeBytes" | "width" | "height" | "scanStatus" | "purpose">;

export function toUploadedFile(file: PresentableFile): UploadedFile {
  return {
    id: file.id,
    url: fileUrl(file),
    thumbnailUrl: thumbnailUrl(file),
    name: file.originalName,
    size: file.sizeBytes,
    mimeType: file.mimeType,
    width: file.width,
    height: file.height,
    scanStatus: file.scanStatus,
    visibility: file.visibility,
    purpose: file.purpose,
  };
}

export function toFileSummary(file: PresentableFile): FileSummary {
  return {
    id: file.id,
    name: file.originalName,
    size: file.sizeBytes,
    mimeType: file.mimeType,
    url: fileUrl(file),
    thumbnailUrl: thumbnailUrl(file),
    width: file.width,
    height: file.height,
    scanStatus: file.scanStatus,
  };
}
