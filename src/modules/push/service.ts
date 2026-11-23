import "server-only";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { cmsEntries, countries, pushSubscriptions } from "@/db/schema";
import { env, integrations } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { RequirementPostData } from "@/modules/content/collections";

import { posterMatchesFilters, requirementAlert, type AlertPoster, type PushMessage } from "./alerts";
import type { PushSubscribeInput } from "./schemas";

/**
 * Web Push: subscriptions from the public site and the "new requirement" alert. Sending never throws for a single
 * subscription: gone endpoints (404/410) are deleted, other failures are counted (and the row dropped after
 * MAX_FAILURES in a row), so a retry of the task does not fail on one bad phone.
 */

const BATCH_SIZE = 200;
const SEND_CONCURRENCY = 10;
const MAX_FAILURES = 5;
const TTL_SECONDS = 2 * 24 * 60 * 60;

/** Public VAPID key for the browser, or null when Web Push is not configured (the UI then hides itself). */
export function pushPublicKey(): string | null {
  return integrations.webPush() ? (env().VAPID_PUBLIC_KEY ?? null) : null;
}

/** Create or refresh the subscription for this endpoint (one row per browser). */
export async function savePushSubscription(input: PushSubscribeInput, userId: string | null): Promise<void> {
  const values = {
    endpoint: input.subscription.endpoint,
    p256dh: input.subscription.keys.p256dh,
    auth: input.subscription.keys.auth,
    userId,
    topics: input.topics,
    trades: input.trades,
    countryCodes: input.countryCodes,
    locale: input.locale,
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: values.p256dh,
        auth: values.auth,
        userId: sql`coalesce(excluded.user_id, ${pushSubscriptions.userId})`,
        topics: values.topics,
        trades: values.trades,
        countryCodes: values.countryCodes,
        locale: values.locale,
        failureCount: 0,
        updatedAt: new Date(),
      },
    });
}

/** Knowing the endpoint (an unguessable URL held by the browser) is what allows removing it. */
export async function removePushSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

async function loadAlertPoster(entryId: string): Promise<AlertPoster | null> {
  const [row] = await db
    .select({ slug: cmsEntries.slug, title: cmsEntries.title, data: cmsEntries.data, status: cmsEntries.status })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.id, entryId), eq(cmsEntries.collection, "requirement_posts"), isNull(cmsEntries.deletedAt)))
    .limit(1);
  if (!row || row.status !== "published") return null;
  const data = (row.data ?? {}) as Partial<RequirementPostData>;
  const code = typeof data.countryCode === "string" && /^[A-Z]{2}$/.test(data.countryCode) ? data.countryCode : null;
  let countryName: string | null = null;
  if (code) {
    const [country] = await db.select({ name: countries.name }).from(countries).where(eq(countries.code, code)).limit(1);
    countryName = country?.name ?? code;
  }
  const trades = Array.isArray(data.trades) ? data.trades.filter((t) => t && typeof t.trade === "string") : [];
  return { slug: row.slug, title: row.title, countryCode: code, countryName, trades };
}

type SendOutcome = "sent" | "gone" | "failed";

async function sendOne(sub: typeof pushSubscriptions.$inferSelect, message: PushMessage): Promise<SendOutcome> {
  const webpush = (await import("web-push")).default;
  const e = env();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ ...message, icon: "/icon", badge: "/icon" }), {
      vapidDetails: { subject: e.VAPID_SUBJECT!, publicKey: e.VAPID_PUBLIC_KEY!, privateKey: e.VAPID_PRIVATE_KEY! },
      TTL: TTL_SECONDS,
      urgency: "normal",
      timeout: 10_000,
    });
    await db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failureCount: 0 }).where(eq(pushSubscriptions.id, sub.id));
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    if (status === 404 || status === 410 || sub.failureCount + 1 >= MAX_FAILURES) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      return "gone";
    }
    await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(eq(pushSubscriptions.id, sub.id));
    logger.warn("Web push failed", { status: typeof status === "number" ? status : null, subscriptionId: sub.id });
    return "failed";
  }
}

/** Send the "new requirement" alert for a published poster to every matching "requirements" subscriber. */
export async function sendRequirementAlert(entryId: string): Promise<Record<SendOutcome | "skipped", number>> {
  const counts = { sent: 0, gone: 0, failed: 0, skipped: 0 };
  if (!integrations.webPush()) return counts;
  const poster = await loadAlertPoster(entryId);
  if (!poster) return counts;
  const message = requirementAlert(poster);

  let afterId: string | null = null;
  for (;;) {
    const batch: (typeof pushSubscriptions.$inferSelect)[] = await db
      .select()
      .from(pushSubscriptions)
      .where(and(sql`'requirements' = any(${pushSubscriptions.topics})`, afterId ? gt(pushSubscriptions.id, afterId) : undefined))
      .orderBy(asc(pushSubscriptions.id))
      .limit(BATCH_SIZE);
    if (!batch.length) break;
    afterId = batch[batch.length - 1]!.id;
    const targets = batch.filter((s) => posterMatchesFilters(poster, { trades: s.trades, countryCodes: s.countryCodes }));
    counts.skipped += batch.length - targets.length;
    for (let i = 0; i < targets.length; i += SEND_CONCURRENCY) {
      const outcomes = await Promise.all(targets.slice(i, i + SEND_CONCURRENCY).map((s) => sendOne(s, message)));
      for (const o of outcomes) counts[o] += 1;
    }
    if (batch.length < BATCH_SIZE) break;
  }
  return counts;
}
