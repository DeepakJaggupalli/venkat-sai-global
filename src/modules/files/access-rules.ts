/**
 * Pure file access rules (no I/O) — the single source of truth for who may read a file.
 * `checkFileAccess()` (access.ts) loads the viewer's grants and calls `evaluateFileAccess()`.
 *
 * Order:
 *  1. deleted → not found
 *  2. public visibility → anyone (even signed out)
 *  3. signed out → unauthenticated
 *  4. owner → allowed
 *  5. owner-only purposes (data exports) → forbidden for everyone else
 *  6. an active explicit grant to the viewer or one of the viewer's organisations
 *  7. members of the file's organisation, for purposes that allow it (with the role permission
 *     the policy requires)
 *  8. staff holding one of the purpose's view permissions
 * Then servability: infected files are never served (quarantine); files still waiting for a
 * malware verdict ("pending"/"error") are only served to their owner.
 */
import { getFilePolicy } from "./policies";
import type { ActiveGrant, FileAccessDecision, FileRow, FileViewer } from "./types";

export type AccessFile = Pick<FileRow, "id" | "purpose" | "visibility" | "ownerUserId" | "organizationId" | "scanStatus" | "deletedAt">;

export function isGrantActive(grant: Pick<ActiveGrant, "expiresAt" | "revokedAt">, now: Date = new Date()): boolean {
  if (grant.revokedAt) return false;
  return !grant.expiresAt || grant.expiresAt.getTime() > now.getTime();
}

function authorize(viewer: FileViewer | null, file: AccessFile, grants: readonly ActiveGrant[], now: Date): FileAccessDecision {
  if (file.deletedAt) return { allowed: false, reason: "not_found" };
  if (file.visibility === "public") return { allowed: true, via: "public", organizationId: null };
  if (!viewer) return { allowed: false, reason: "unauthenticated" };
  if (file.ownerUserId && file.ownerUserId === viewer.userId) return { allowed: true, via: "owner", organizationId: null };

  const policy = getFilePolicy(file.purpose);
  if (policy.ownerOnly) return { allowed: false, reason: "forbidden" };

  const viewerOrgIds = new Set(viewer.memberships.map((m) => m.organizationId));
  for (const grant of grants) {
    if (!isGrantActive(grant, now)) continue;
    if (grant.granteeUserId && grant.granteeUserId === viewer.userId) return { allowed: true, via: "grant", organizationId: null };
    if (grant.granteeOrganizationId && viewerOrgIds.has(grant.granteeOrganizationId)) {
      return { allowed: true, via: "grant", organizationId: grant.granteeOrganizationId };
    }
  }

  if (policy.orgView && file.organizationId) {
    const membership = viewer.memberships.find((m) => m.organizationId === file.organizationId);
    if (membership && (policy.orgView.permissions.length === 0 || policy.orgView.permissions.some((p) => membership.permissions.has(p)))) {
      return { allowed: true, via: "organization", organizationId: membership.organizationId };
    }
  }

  if (viewer.isStaff && policy.staffView.some((p) => viewer.staffPermissions.has(p))) {
    return { allowed: true, via: "staff", organizationId: null };
  }

  return { allowed: false, reason: "forbidden" };
}

export function evaluateFileAccess(
  viewer: FileViewer | null,
  file: AccessFile,
  grants: readonly ActiveGrant[] = [],
  now: Date = new Date(),
): FileAccessDecision {
  const decision = authorize(viewer, file, grants, now);
  if (!decision.allowed) return decision;
  if (file.scanStatus === "infected") return { allowed: false, reason: "quarantined" };
  if ((file.scanStatus === "pending" || file.scanStatus === "error") && decision.via !== "owner") {
    return { allowed: false, reason: "processing" };
  }
  return decision;
}

/** Whether reading this file should be recorded in data_access_logs. */
export function shouldLogDataAccess(file: Pick<FileRow, "purpose">, decision: FileAccessDecision): boolean {
  if (!decision.allowed) return false;
  if (decision.via === "owner" || decision.via === "public") return false;
  return getFilePolicy(file.purpose).sensitive;
}
