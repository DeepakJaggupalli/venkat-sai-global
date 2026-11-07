/**
 * File UI building blocks (see src/modules/files/README.md).
 *   <FileUpload purpose="resume" name="resumeFileId" />   — client component (uploads + hidden inputs)
 *   <FilePreview file={summary} />                         — thumbnail / type icon + details
 *   <FileLink file={summary} download />                   — accessible open/download link
 */
export { FileUpload, DEFAULT_MESSAGES as FILE_UPLOAD_DEFAULT_MESSAGES, type FileUploadProps, type FileUploadMessages } from "./file-upload";
export { FilePreview, type FilePreviewProps } from "./file-preview";
export { FileLink, type FileLinkProps } from "./file-link";
