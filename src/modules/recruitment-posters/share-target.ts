import "server-only";

import { logger } from "@/lib/logger";
import { FileValidationError } from "@/modules/files";
import { getStaffContext, staffCan, type StaffContext } from "@/modules/identity/authz";
import { staffTwoFactorMissing } from "@/modules/identity/staff-route";

import { POSTER_PERMISSIONS, storeSharedPoster } from "./service";

/**
 * Staff side of the Web Share Target (POST /share, and the older POST /admin/requirements/posters/share): a
 * signed-in staff member with content.edit + media.manage who shares an IMAGE gets it stored as their private
 * draft upload (purpose cms_media) and continues on the "Post requirement" page with it prefilled. Everyone else
 * (and staff sharing a PDF or Word file) uses the public shared-upload flow (/share/choose).
 */

export const POSTER_NEW_PAGE = "/admin/requirements/posters/new";
export const POSTER_SHARE_MAX_BYTES = 20 * 1024 * 1024;

/** The signed-in staff context when it may post requirement posters, else null. */
export async function getPosterStaff(): Promise<StaffContext | null> {
  const ctx = await getStaffContext();
  if (!ctx || !staffCan(ctx, [...POSTER_PERMISSIONS])) return null;
  // Same rule as every other staff route: no upload until required two-factor authentication is set up.
  return (await staffTwoFactorMissing(ctx)) ? null : ctx;
}

/** Store the shared image for the staff poster flow; returns the page to continue on. */
export async function sharePosterForStaff(ctx: StaffContext, poster: File, shared: { title?: string; text?: string }): Promise<string> {
  try {
    const stored = await storeSharedPoster(ctx, { data: new Uint8Array(await poster.arrayBuffer()), name: poster.name, type: poster.type || null }, shared);
    return `${POSTER_NEW_PAGE}?file=${stored.id}`;
  } catch (error) {
    if (error instanceof FileValidationError) return `${POSTER_NEW_PAGE}?share_error=type`;
    logger.error("Shared poster could not be stored", { error });
    return `${POSTER_NEW_PAGE}?share_error=store`;
  }
}

/** Shared files from a share-sheet form: `file` (current manifest) or `poster` (installs from the older manifest). */
export function sharedFilesFrom(form: FormData): File[] {
  return [...form.getAll("file"), ...form.getAll("poster")].filter((f): f is File => f instanceof File && f.size > 0);
}

/** WhatsApp and other apps send the message as `text` (and sometimes `url`); `title` is rarely set. */
export function sharedTextFrom(form: FormData): { title?: string; text?: string } {
  const text = [form.get("text"), form.get("url")].filter((v): v is string => typeof v === "string" && v.trim() !== "").join("\n");
  const title = form.get("title");
  return { title: typeof title === "string" ? title : undefined, text: text || undefined };
}
