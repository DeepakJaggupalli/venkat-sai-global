"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createFormAction, ok } from "@/lib/actions";
import { formatFileSize } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { BACKUP_ADMIN_PATH, BACKUP_PERMISSION, backupSettingsSchema } from "@/modules/backup/schemas";
import { emailBackupNow, saveBackupSettings } from "@/modules/backup/service";
import { requireStaff } from "@/modules/identity/authz";

/** Daily backup email on / off and its address (Super Admin). Audited by the service. */
export const saveBackupSettingsAction = createFormAction(backupSettingsSchema, async (input) => {
  const ctx = await requireStaff(BACKUP_PERMISSION);
  const { changed } = await saveBackupSettings(ctx, input);
  revalidatePath(BACKUP_ADMIN_PATH);
  return ok(undefined, changed ? "Backup settings saved" : "No changes to save");
});

/**
 * "Email a backup now": the same email as the daily one (passport numbers cut to the last 4 digits), to the same
 * address, at once. Rate limited because each one builds the whole workbook.
 */
export const emailBackupNowAction = createFormAction(z.object({}), async () => {
  const ctx = await requireStaff(BACKUP_PERMISSION);
  const limit = await rateLimit(`admin:backup-email:${ctx.user.id}`, 3, 3600);
  if (!limit.allowed) throw new ActionError("You have sent several backups in the last hour. Try again later.");
  const sent = await emailBackupNow(ctx);
  revalidatePath(BACKUP_ADMIN_PATH);
  if (sent.provider === "dev") return ok(undefined, `Backup kept in the development outbox for ${sent.to}: emails are not switched on yet`);
  return ok(undefined, sent.attached ? `Backup sent to ${sent.to} (${formatFileSize(sent.sizeBytes)})` : `Email sent to ${sent.to}. The file was too large to attach, so download it here.`);
});
