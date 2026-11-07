/**
 * Contract of GET /api/v1/notifications/summary as consumed by the notification bell
 * (client-safe, pure). The endpoint itself is owned by the notifications module.
 *
 *   { unreadCount: number, items: [{ id, title, body, link, createdAt, readAt }] }
 */
import { z } from "zod";

const itemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().nullish(),
  /** Relative in-app path; anything else is ignored by the bell. */
  link: z.string().nullish(),
  /** ISO timestamp. */
  createdAt: z.string().min(1),
  readAt: z.string().nullish(),
});

const summarySchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  items: z.array(z.unknown()),
});

export type NotificationSummaryItem = z.infer<typeof itemSchema>;
export type NotificationSummary = { unreadCount: number; items: NotificationSummaryItem[] };

export const EMPTY_NOTIFICATION_SUMMARY: NotificationSummary = { unreadCount: 0, items: [] };

/** Parse the endpoint payload; malformed items are skipped instead of failing the whole list. */
export function parseNotificationSummary(payload: unknown): NotificationSummary | null {
  const parsed = summarySchema.safeParse(payload);
  if (!parsed.success) return null;
  const items: NotificationSummaryItem[] = [];
  for (const raw of parsed.data.items) {
    const item = itemSchema.safeParse(raw);
    if (item.success) items.push(item.data);
  }
  return { unreadCount: parsed.data.unreadCount, items };
}
