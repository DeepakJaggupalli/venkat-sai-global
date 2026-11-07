/**
 * Files module types (client-safe).
 */
import type { files, fileAccessGrants } from "@/db/schema";
import type { FilePurpose, FileScanStatus, FileVisibility, OrgType } from "@/db/schema/_constants";

import type { ImageVariantName } from "./policies";

export type FileRow = typeof files.$inferSelect;
export type FileAccessGrantRow = typeof fileAccessGrants.$inferSelect;

/** JSON returned by POST /api/v1/uploads (also the shape <FileUpload> works with). */
export type UploadedFile = {
  id: string;
  /** URL to open/download the file (public: /media/…, private: /api/v1/files/…). */
  url: string;
  /** Small preview URL for images (WebP thumbnail when available), else null. */
  thumbnailUrl: string | null;
  name: string;
  size: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  scanStatus: FileScanStatus;
  visibility: FileVisibility;
  purpose: FilePurpose;
};

/** Minimal file description used by FilePreview / FileLink / FileUpload defaults. */
export type FileSummary = {
  id: string;
  name: string;
  size: number | null;
  mimeType: string;
  url: string;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  scanStatus?: FileScanStatus;
};

/**
 * The person asking to read a file. Built from the session by getCurrentFileViewer(), or for a
 * given user id by loadFileViewer() (background jobs).
 */
export type FileViewer = {
  userId: string;
  isStaff: boolean;
  /** Platform permissions (empty for non-staff, and for staff who must still set up 2FA). */
  staffPermissions: ReadonlySet<string>;
  /** Active organisation memberships with their role permissions. */
  memberships: ReadonlyArray<{ organizationId: string; organizationType: OrgType; permissions: ReadonlySet<string> }>;
};

export type FileAccessVia = "public" | "owner" | "grant" | "organization" | "staff";

export type FileAccessDenial = "not_found" | "unauthenticated" | "forbidden" | "quarantined" | "processing";

export type FileAccessDecision =
  | { allowed: true; via: FileAccessVia; /** Organisation through which access was obtained (grant to an org / membership). */ organizationId: string | null }
  | { allowed: false; reason: FileAccessDenial };

/** Subset of a grant needed to evaluate access. */
export type ActiveGrant = Pick<FileAccessGrantRow, "id" | "granteeUserId" | "granteeOrganizationId" | "expiresAt" | "revokedAt">;

export type FileVariantMap = Partial<Record<ImageVariantName, { key: string; width: number; height: number; mimeType: string }>>;
