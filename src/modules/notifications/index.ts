import "server-only";

import type { PlatformPermission } from "@/config/permissions";
import type { DbOrTx } from "@/db";
import { enqueueTask } from "@/server/tasks/queue";

import type { NotificationChannel, NotificationEvent } from "./events";

export type { NotificationChannel, NotificationEvent } from "./events";

/**
 * Public notification API — the ONLY way modules send notifications.
 *
 *   await notify({
 *     event: "application.status_changed",
 *     recipients: [{ userId: candidateUserId }],
 *     data: { applicationCode, jobTitle, status: "Shortlisted" },
 *     link: `/talent/applications/${applicationId}`,
 *   });
 *
 * Delivery is asynchronous: a "notifications.dispatch" task renders the event's templates
 * (per channel + recipient locale), respects preferences/consent/feature flags, writes in-app
 * notifications and delivery logs, and retries failures. Pass { tx } to enqueue atomically.
 *
 * `data` must contain only what the template needs (names, codes, titles, dates) —
 * never secrets, OTPs, document contents or internal notes.
 */
export type NotificationRecipient =
  | { userId: string }
  | { email: string; name?: string; locale?: string }
  | { phone: string; locale?: string };

export type NotifyInput = {
  event: NotificationEvent;
  recipients: NotificationRecipient[];
  data?: Record<string, unknown>;
  /** Relative app path opened from the notification (in-app click / email button). */
  link?: string | null;
  /** Override default channels for this event (still subject to preferences/flags). */
  channels?: NotificationChannel[];
  organizationId?: string | null;
  /** Prevents duplicates of the same logical notification (e.g. `interview-reminder:${id}:24h`). */
  dedupeKey?: string;
};

export async function notify(input: NotifyInput, opts: { tx?: DbOrTx; runAt?: Date } = {}): Promise<void> {
  if (!input.recipients.length) return;
  await enqueueTask("notifications.dispatch", input as unknown as Record<string, unknown>, {
    tx: opts.tx,
    runAt: opts.runAt,
    dedupeKey: input.dedupeKey ? `notify:${input.dedupeKey}` : undefined,
  });
}

/** Notify every active staff member holding a permission (e.g. new approval → approvals.view). */
export async function notifyStaff(
  input: Omit<NotifyInput, "recipients"> & { permission: PlatformPermission },
  opts: { tx?: DbOrTx } = {},
): Promise<void> {
  await enqueueTask("notifications.dispatch_staff", input as unknown as Record<string, unknown>, {
    tx: opts.tx,
    dedupeKey: input.dedupeKey ? `notify-staff:${input.dedupeKey}` : undefined,
  });
}

/** Notify every active member of an organisation holding a permission (e.g. employer.pipeline.view). */
export async function notifyOrganization(
  input: Omit<NotifyInput, "recipients"> & { organizationId: string; permission?: string },
  opts: { tx?: DbOrTx } = {},
): Promise<void> {
  await enqueueTask("notifications.dispatch_org", input as unknown as Record<string, unknown>, {
    tx: opts.tx,
    dedupeKey: input.dedupeKey ? `notify-org:${input.dedupeKey}` : undefined,
  });
}
