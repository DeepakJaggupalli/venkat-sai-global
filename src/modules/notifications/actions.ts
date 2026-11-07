"use server";

import { revalidatePath } from "next/cache";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";

import {
  markAllReadSchema,
  notificationIdsSchema,
  preferencesFormSchema,
  templateActiveSchema,
  templateFormSchema,
  templatePreviewSchema,
  unsubscribeFormSchema,
} from "./schemas";
import {
  archive,
  markAllRead,
  markRead,
  previewNotificationTemplate,
  setNotificationTemplateActive,
  setPreferences,
  unarchive,
  unsubscribeWithToken,
  upsertNotificationTemplate,
} from "./service";
import type { TemplatePreview, UnsubscribeResult } from "./types";

/**
 * Server Actions for the notification centre, preferences, unsubscribe page and template admin.
 * Each one authorises the caller itself (layouts do not protect actions).
 */

function revalidateInbox() {
  revalidatePath("/account/notifications");
  revalidatePath("/talent/notifications");
}

export const markNotificationsReadAction = createAction(notificationIdsSchema, async ({ ids }) => {
  const user = await requireUser();
  const updated = await markRead(user.id, ids);
  revalidateInbox();
  return ok({ updated });
});

export const markAllNotificationsReadAction = createAction(markAllReadSchema, async ({ organizationId }) => {
  const user = await requireUser();
  const updated = await markAllRead(user.id, { organizationId });
  revalidateInbox();
  return ok({ updated }, updated ? "All notifications marked as read" : "You have no unread notifications");
});

export const archiveNotificationsAction = createAction(notificationIdsSchema, async ({ ids }) => {
  const user = await requireUser();
  const updated = await archive(user.id, ids);
  revalidateInbox();
  return ok({ updated }, updated === 1 ? "Notification archived" : `${updated} notifications archived`);
});

export const unarchiveNotificationsAction = createAction(notificationIdsSchema, async ({ ids }) => {
  const user = await requireUser();
  const updated = await unarchive(user.id, ids);
  revalidateInbox();
  return ok({ updated }, "Moved back to your notifications");
});

export const saveNotificationPreferencesAction = createFormAction(preferencesFormSchema, async ({ preferences }) => {
  const user = await requireUser();
  const { updated } = await setPreferences(user.id, preferences, { source: "settings", actorUserId: user.id });
  revalidatePath("/account/notifications/preferences");
  return ok({ updated }, updated ? "Notification preferences saved" : "No changes to save");
});

/** Confirm button on /notifications/unsubscribe (the token authenticates the request; no sign-in needed). */
export const unsubscribeAction = createFormAction(unsubscribeFormSchema, async ({ token }) => {
  const result: UnsubscribeResult = await unsubscribeWithToken(token);
  return ok(result, result.alreadyUnsubscribed ? "You were already unsubscribed" : "You have been unsubscribed");
});

// ---------------------------------------------------------------------------
// Command Centre: templates
// ---------------------------------------------------------------------------

export const saveNotificationTemplateAction = createFormAction(templateFormSchema, async (input) => {
  const ctx = await requireStaff("notifications.templates");
  const result = await upsertNotificationTemplate(ctx, input);
  revalidatePath("/admin/notifications");
  return ok(result, result.created ? "Template created" : `Template saved (version ${result.version})`);
});

export const setNotificationTemplateActiveAction = createAction(templateActiveSchema, async ({ id, isActive }) => {
  const ctx = await requireStaff("notifications.templates");
  await setNotificationTemplateActive(ctx, id, isActive);
  revalidatePath("/admin/notifications");
  return ok(undefined, isActive ? "Template activated" : "Template deactivated; the default applies");
});

export const previewNotificationTemplateAction = createAction(templatePreviewSchema, async (input) => {
  const ctx = await requireStaff("notifications.templates");
  const preview: TemplatePreview = await previewNotificationTemplate(ctx, input);
  return ok(preview);
});
