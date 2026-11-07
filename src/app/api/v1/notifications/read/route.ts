import { logger } from "@/lib/logger";
import { isSameOrigin } from "@/lib/request";
import { getCurrentUser } from "@/modules/identity/session";
import { unreadCount } from "@/modules/notifications/queries";
import { markReadRequestSchema } from "@/modules/notifications/schemas";
import { markAllRead, markRead } from "@/modules/notifications/service";

/**
 * POST /api/v1/notifications/read — mark the signed-in user's notifications as read.
 * Body (JSON): `{ "ids": ["<uuid>", …] }` (up to 100) or `{ "all": true, "organizationId"?: "<uuid>" }`.
 *   200 { updated, unreadCount } · 400 invalid body · 401 signed out · 403 cross-site request (CSRF).
 * Only the caller's own notifications can change (the update is scoped to their user id).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403, headers: NO_STORE });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers: NO_STORE });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400, headers: NO_STORE });
  }
  const parsed = markReadRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });

  try {
    const updated = "all" in parsed.data ? await markAllRead(user.id, { organizationId: parsed.data.organizationId }) : await markRead(user.id, parsed.data.ids);
    return Response.json({ updated, unreadCount: await unreadCount(user.id) }, { headers: NO_STORE });
  } catch (error) {
    logger.error("Marking notifications read failed", { error });
    return Response.json({ error: "Could not update notifications. Please try again." }, { status: 500, headers: NO_STORE });
  }
}
