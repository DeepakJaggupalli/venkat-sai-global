import "server-only";

import type { DbOrTx } from "@/db";
import { logger } from "@/lib/logger";
import { notify } from "@/modules/notifications";
import type { NotificationEvent } from "@/modules/notifications/events";
import { getSetting } from "@/modules/settings";

/**
 * Email copy of new public submissions (CVs, contact enquiries, workforce requirements) to the business inbox
 * set in `notifications.business_inbox_email` (blank = off). Sent through the normal notification pipeline as a
 * raw email recipient, so it uses whichever email transport is configured (SMTP when set, the dev outbox
 * otherwise). Staff wording (`forStaff: true`); the link points at the Command Centre, never at a file.
 */
export async function notifyBusinessInbox(input: { event: NotificationEvent; data: Record<string, unknown>; link: string }, tx: DbOrTx): Promise<void> {
  let email: string;
  try {
    email = String((await getSetting("notifications.business_inbox_email")) ?? "").trim().toLowerCase();
  } catch (error) {
    logger.warn("Business inbox setting could not be read", { error: error instanceof Error ? error.message : String(error) });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  await notify({ event: input.event, recipients: [{ email, name: "Venkat Sai team" }], data: { ...input.data, forStaff: true }, link: input.link, channels: ["email"] }, { tx });
}
