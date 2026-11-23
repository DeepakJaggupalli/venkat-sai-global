/**
 * Web Push subscription input (client-safe). The browser sends PushSubscription.toJSON() plus optional filters.
 */
import { z } from "zod";

import type { PushTopic } from "@/db/schema/push";

/**
 * Push services of the browsers we support (Chrome/Android/Samsung/Opera: FCM, Firefox: Mozilla, Edge: WNS,
 * Safari/iOS: Apple). The server POSTs to the endpoint, so any other host is refused (no SSRF through alerts).
 */
const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"] as const;

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key");

export const pushEndpointSchema = z.string().trim().min(10).max(2048).refine(isAllowedPushEndpoint, "This browser's push service is not supported");

export const pushTopicSchema = z.enum(["requirements"] satisfies [PushTopic, ...PushTopic[]]);

export const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: pushEndpointSchema,
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: base64url(80, 100), auth: base64url(16, 32) }),
  }),
  topics: z.array(pushTopicSchema).min(1).max(5).default(["requirements"]),
  /** Trade keywords ("welder"); stored lower-case, de-duplicated. */
  trades: z
    .array(z.string().trim().min(2).max(60))
    .max(5)
    .default([])
    .transform((list) => [...new Set(list.map((t) => t.toLowerCase().replace(/\s+/g, " ")))]),
  countryCodes: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/),
    )
    .max(5)
    .default([])
    .transform((list) => [...new Set(list)]),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Za-z]{2})?$/)
    .default("en"),
});
export type PushSubscribeInput = z.output<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: pushEndpointSchema });
