import "server-only";

/**
 * Files module — public server API (see README.md).
 * Client components import from "@/modules/files/policies", "@/modules/files/urls" and
 * "@/modules/files/types" (client-safe) or use the components in src/components/files.
 */
export {
  storeFile,
  getFile,
  getFiles,
  requireUploadedFile,
  setFileVisibility,
  softDeleteFile,
  openFileContent,
  FileValidationError,
  FILE_PURGE_GRACE_DAYS,
  type StoreFileInput,
  type FileExpectation,
  type FileErrorCode,
  type FileContent,
} from "./service";
export {
  canAccessFile,
  checkFileAccess,
  getCurrentFileViewer,
  loadFileViewer,
  grantFileAccess,
  revokeFileAccess,
  listFileGrants,
  type GrantFileAccessInput,
  type RevokeFileAccessFilter,
} from "./access";
export { evaluateFileAccess, shouldLogDataAccess } from "./access-rules";
export { fileUrl, thumbnailUrl, type FileUrlInput, type FileUrlOptions } from "./urls";
export { FILE_POLICIES, getFilePolicy, getClientFilePolicy, type FilePolicy, type ImageVariantName } from "./policies";
export { toUploadedFile, toFileSummary } from "./present";
export type { FileRow, FileViewer, FileAccessDecision, FileAccessVia, UploadedFile, FileSummary } from "./types";
