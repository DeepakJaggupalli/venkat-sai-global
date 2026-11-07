"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, ok } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/modules/audit";
import { requireStaff } from "@/modules/identity/authz";
import { sendEmail, sendSms } from "@/modules/messaging";
import { notify } from "@/modules/notifications";
import { isNotificationEvent } from "@/modules/notifications/channels";
import type { NotificationEvent } from "@/modules/notifications/events";
import { previewNotificationTemplate } from "@/modules/notifications/service";

import { retryDeliveryNow } from "./_lib/deliveries";

const testSendSchema = z.object({
  eventKey: z.string().refine(isNotificationEvent, "Choose a notification event"),
  channel: z.enum(["in_app", "email", "sms", "whatsapp"]),
  locale: z.string().trim().max(12).optional(),
  subject: z.string().max(300).optional(),
  body: z.string().max(10_000).optional(),
});

/**
 * Send the template to yourself with the built-in sample data. Email and SMS render the draft on screen
 * exactly (subject prefixed with [Test]); in-app and WhatsApp go through the normal dispatch and therefore
 * use the saved, active template. Only to your own verified address; rate limited.
 */
export const sendTestNotificationAction = createAction(testSendSchema, async (input) => {
  const ctx = await requireStaff("notifications.templates");
  const limit = await rateLimit(`notification-test:${ctx.user.id}`, 10, 3600);
  if (!limit.allowed) throw new ActionError("You have sent several test messages. Please wait a few minutes.");
  const user = ctx.user;

  if (input.channel === "email" || input.channel === "sms") {
    const preview = await previewNotificationTemplate(ctx, { eventKey: input.eventKey, channel: input.channel, locale: input.locale, subject: input.subject, body: input.body });
    if (input.channel === "email") {
      if (!user.email || !user.emailVerifiedAt) throw new ActionError("Verify your email address in your account settings to receive test emails.");
      const result = await sendEmail({ to: user.email, subject: `[Test] ${preview.subject}`, html: preview.html, text: preview.text, tags: ["template-test"] });
      if (!result.ok) throw new ActionError(`The email could not be sent (${result.provider}): ${result.error.slice(0, 200)}`);
    } else {
      if (!user.phone || !user.phoneVerifiedAt) throw new ActionError("Verify your phone number in your account settings to receive test SMS.");
      const result = await sendSms({ to: user.phone, body: preview.text });
      if (!result.ok) throw new ActionError(`The SMS could not be sent (${result.provider}): ${result.error.slice(0, 200)}`);
    }
  } else {
    await notify({ event: input.eventKey as NotificationEvent, recipients: [{ userId: user.id }], channels: [input.channel], data: { test: true }, link: "/admin/notifications" });
  }
  await audit({ action: "notification.template_test_sent", entityType: "notification_template", metadata: { eventKey: input.eventKey, channel: input.channel }, actorUserId: user.id, actorType: "staff" });
  return ok(undefined, input.channel === "email" ? "Test email sent to your address" : input.channel === "sms" ? "Test SMS sent to your phone" : "Test sent using the active template");
});

export const retryDeliveryAction = createAction(z.object({ id: z.uuid() }), async ({ id }) => {
  const ctx = await requireStaff("notifications.logs");
  const result = await retryDeliveryNow(id);
  if (!result.ok) throw new ActionError(result.reason);
  await audit({ action: "notification.delivery_retry_requested", entityType: "notification_delivery", entityId: id, metadata: { mode: result.mode }, actorUserId: ctx.user.id, actorType: "staff" });
  revalidatePath("/admin/notifications/deliveries");
  return ok(undefined, "Retry scheduled. Refresh in a minute to see the result.");
});
