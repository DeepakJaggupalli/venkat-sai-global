import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { xlsxResponse } from "@/lib/xlsx-export";
import { BACKUP_PERMISSION } from "@/modules/backup/schemas";
import { downloadFullBackup } from "@/modules/backup/service";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";

/**
 * GET /admin/system/backup/download — the full backup workbook (one sheet per area) for the Super Admin
 * (settings.security). Full passport numbers only with candidates.view_documents, full phone numbers and emails only
 * with candidates.view_contact. Rate limited; every download is written to the data-access log and the audit trail
 * (export.downloaded, list "full_backup") before the file is returned. Never cached.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in as staff to download the backup.", { status: 401 });
  if (!staffCan(ctx, BACKUP_PERMISSION)) return new Response("Only the Super Admin can download the full backup.", { status: 403 });
  // Same rule as the Command Centre pages: when staff must use two-factor sign-in, so must this download.
  if (!ctx.user.twoFactorEnabled && (await getSetting("security.require_staff_2fa"))) {
    return new Response("Set up two-factor authentication at /account/security first.", { status: 403 });
  }
  const limit = await rateLimit(`admin:backup-download:${ctx.user.id}`, 6, 3600);
  if (!limit.allowed) return new Response("Too many backup downloads. Try again later.", { status: 429 });

  try {
    const backup = await downloadFullBackup(ctx);
    return xlsxResponse(backup.bytes, backup.filename);
  } catch (error) {
    if (error instanceof ActionError) return new Response(error.message, { status: error.code === "forbidden" ? 403 : 400 });
    logger.error("Full backup download failed", { error });
    return new Response("The backup could not be prepared. Please try again.", { status: 500 });
  }
}
