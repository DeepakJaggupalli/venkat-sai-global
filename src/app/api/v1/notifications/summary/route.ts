import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/modules/identity/session";
import { getNotificationSummary } from "@/modules/notifications/queries";

/**
 * GET /api/v1/notifications/summary — unread count + latest 8 notifications of the signed-in user
 * (polled by the notification bell, contract in src/components/layout/notification-summary.ts).
 *   200 { unreadCount, items: [{ id, title, body, link, createdAt, readAt }] }
 *   401 { error } when signed out. Never cached (personal data).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in to see your notifications." }, { status: 401, headers: NO_STORE });
  try {
    const summary = await getNotificationSummary(user.id, 8);
    return Response.json(summary, { headers: NO_STORE });
  } catch (error) {
    logger.error("Notification summary failed", { error });
    return Response.json({ error: "Notifications are unavailable right now." }, { status: 500, headers: NO_STORE });
  }
}
