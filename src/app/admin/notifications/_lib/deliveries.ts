import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { backgroundJobs, notificationDeliveries } from "@/db/schema";
import { MAX_DELIVERY_ATTEMPTS } from "@/modules/notifications/dispatch";

/**
 * Manual retry for failed deliveries. The notifications module schedules retries itself (with backoff)
 * and keeps the send payload only on the retry task, so a manual retry reuses that task: a waiting retry
 * runs now; a finished one is re-enqueued with the same payload. Deliveries at the attempt limit, or
 * without a stored retry payload, cannot be retried from here (see the module README).
 */

export type RetryAvailability = { deliveryId: string; canRetry: boolean };

export async function retryAvailability(deliveryIds: string[]): Promise<Map<string, boolean>> {
  if (!deliveryIds.length) return new Map();
  const rows = await db
    .select({ deliveryId: sql<string>`${backgroundJobs.payload}->>'deliveryId'` })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, "notifications.retry_delivery"), inArray(sql<string>`${backgroundJobs.payload}->>'deliveryId'`, deliveryIds)));
  const withPayload = new Set(rows.map((r) => r.deliveryId));
  return new Map(deliveryIds.map((id) => [id, withPayload.has(id)]));
}

export async function retryDeliveryNow(deliveryId: string): Promise<{ ok: true; mode: "advanced" | "requeued" } | { ok: false; reason: string }> {
  const [delivery] = await db
    .select({ id: notificationDeliveries.id, status: notificationDeliveries.status, attempts: notificationDeliveries.attempts })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, deliveryId))
    .limit(1);
  if (!delivery) return { ok: false, reason: "Delivery not found." };
  if (delivery.status !== "failed") return { ok: false, reason: "Only failed deliveries can be retried." };
  if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) return { ok: false, reason: `This delivery reached the limit of ${MAX_DELIVERY_ATTEMPTS} attempts.` };

  const [job] = await db
    .select({ id: backgroundJobs.id, status: backgroundJobs.status, payload: backgroundJobs.payload })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, "notifications.retry_delivery"), sql`${backgroundJobs.payload}->>'deliveryId' = ${deliveryId}`))
    .orderBy(desc(backgroundJobs.id))
    .limit(1);
  if (!job) return { ok: false, reason: "No retry information is stored for this delivery." };

  if (job.status === "queued") {
    await db.update(backgroundJobs).set({ runAt: new Date() }).where(and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.status, "queued")));
    return { ok: true, mode: "advanced" };
  }
  if (job.status === "running") return { ok: false, reason: "A retry is running right now." };
  if (!job.payload || typeof job.payload.recipient === "undefined") return { ok: false, reason: "The retry information for this delivery has been removed." };
  await db.insert(backgroundJobs).values({
    type: "notifications.retry_delivery",
    payload: job.payload,
    runAt: new Date(),
    maxAttempts: 3,
    dedupeKey: `notifications.retry:${deliveryId}:manual:${delivery.attempts}`,
  }).onConflictDoNothing();
  return { ok: true, mode: "requeued" };
}
