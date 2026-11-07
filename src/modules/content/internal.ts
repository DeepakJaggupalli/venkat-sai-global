import "server-only";

import type { PlatformPermission } from "@/config/permissions";
import { ActionError } from "@/lib/actions";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

/**
 * Shared helpers of the content services: authorisation checks for the actor a service receives, and
 * translation of database constraint errors into user-facing messages (docs/SCHEMA_NOTES.md §5).
 */

/** Throw an ActionError unless the staff context holds the permission(s). Services re-check even when the page already did. */
export function assertStaff(ctx: StaffContext, permission: PlatformPermission | PlatformPermission[], message?: string, mode: "all" | "any" = "all"): void {
  if (!ctx?.user?.isStaff || !staffCan(ctx, permission, mode)) {
    throw new ActionError(message ?? "You do not have permission to do this.", { code: "forbidden" });
  }
}

export type PgErrorInfo = { code: string | null; constraint: string | null };

/** SQLSTATE + constraint name, following Drizzle's `cause` chain. */
export function pgErrorInfo(error: unknown): PgErrorInfo {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return { code: candidate.code, constraint: typeof candidate.constraint === "string" ? candidate.constraint : null };
    }
    current = candidate.cause;
  }
  return { code: null, constraint: null };
}

const CONSTRAINT_MESSAGES: Readonly<Record<string, string>> = {
  cms_entries_collection_slug_locale_uq: "This URL slug is already used in this collection and language. Choose another slug.",
  cms_entries_consent_required_chk: "Testimonials, case studies and team members need recorded consent (status obtained, with evidence) before they can be published or scheduled.",
  cms_entries_consent_evidence_chk: "Consent marked as obtained needs the date it was obtained and evidence (a file or a note saying where it is kept).",
  cms_entries_consent_dates_chk: "The consent expiry date must be after the date consent was obtained.",
  cms_entries_logo_permission_chk: "A client logo needs a logo permission before it can be published.",
  cms_entries_window_chk: "The unpublish time must be after the publication time.",
  cms_entries_slug_chk: "Use lower-case letters, numbers and hyphens in the slug (up to 200 characters).",
  cms_entries_title_chk: "Enter a title.",
  cms_entry_versions_entry_version_uq: "Someone else saved this entry at the same time. Reload it and try again.",
  media_assets_public_chk: "A public media item needs a people assessment, consent when people are shown, and (for images) a text alternative.",
  media_assets_consent_evidence_chk: "Consent marked as obtained needs the date it was obtained and evidence (a file or a note saying where it is kept).",
  media_assets_consent_dates_chk: "The consent expiry date must be after the date consent was obtained.",
  media_assets_people_consent_chk: "A media item showing identifiable people needs a consent status other than 'not required'.",
  media_assets_file_uq: "This file is already in the media library.",
  media_assets_embed_url_chk: "Enter a YouTube or Vimeo link.",
  media_folders_parent_name_uq: "A folder with this name already exists here.",
  media_folders_name_chk: "Folder names are 1 to 120 characters.",
  media_folders_parent_chk: "A folder cannot be inside itself.",
  logo_permissions_approved_chk: "Approval needs evidence (a file or reference), the person who granted permission, the grant date and at least one display location.",
  logo_permissions_dates_chk: "The expiry date must be after the grant date.",
  logo_permissions_revoked_chk: "A revoked permission needs a revocation date.",
  announcements_link_chk: "Links must be a site path starting with / or a full http(s) link.",
  announcements_window_chk: "The end must be after the start.",
  announcements_targets_chk: "Choose at least one audience and one placement.",
  public_metrics_display_chk: "A visible manual figure needs a public definition, evidence and a current approval. A visible live figure needs a definition.",
  public_metrics_key_uq: "A metric with this key already exists.",
  public_metrics_manual_chk: "A manual figure needs a value and an as-of date.",
  public_metrics_live_chk: "This metric has no live counter.",
};

/** Re-throw known constraint violations as ActionError; unknown errors are re-thrown untouched. */
export function rethrowConstraint(error: unknown, extra: Readonly<Record<string, string>> = {}): never {
  if (error instanceof ActionError) throw error;
  const info = pgErrorInfo(error);
  const message = info.constraint ? (extra[info.constraint] ?? CONSTRAINT_MESSAGES[info.constraint]) : undefined;
  if (message) throw new ActionError(message, { code: info.constraint ?? undefined });
  throw error;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const info = pgErrorInfo(error);
  return info.code === "23505" && (!constraint || info.constraint === constraint);
}

/** "YYYY-MM-DD" → Date at UTC midnight (consent / grant dates entered as calendar dates). */
export function dateFromCalendar(value: string | undefined | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** Escape LIKE wildcards in user search input. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
