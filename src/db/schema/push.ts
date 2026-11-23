/**
 * Web Push subscriptions (free phone notifications, e.g. "new requirement posted"). Layer 19 — references users only.
 *
 * One row per browser push endpoint (unique). Anonymous visitors can subscribe (userId null); a signed-in
 * visitor's subscription is linked to the account and unlinked when the account is deleted. Optional filters
 * (`trades`: lower-case keywords, `countryCodes`: ISO 3166-1 alpha-2) narrow which alerts are sent. Endpoints
 * that the push service reports gone (404/410) are deleted; other failures count up in `failureCount`.
 * Written and read by src/modules/push only.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { emptyTextArray, pk, timestamps, tstz } from "./_shared";
import { users } from "./core";

export const PUSH_TOPICS = ["requirements"] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: pk(),
    endpoint: text().notNull(),
    /** Subscription keys from PushSubscription.toJSON().keys (base64url). */
    p256dh: text().notNull(),
    auth: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    topics: text().array().$type<PushTopic[]>().notNull().default(sql`'{requirements}'::text[]`),
    trades: text().array().notNull().default(emptyTextArray),
    countryCodes: text().array().notNull().default(emptyTextArray),
    locale: text().notNull().default("en"),
    ...timestamps,
    lastSuccessAt: tstz(),
    failureCount: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
    check("push_subscriptions_endpoint_len_chk", sql`char_length(${t.endpoint}) between 10 and 2048`),
  ],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
