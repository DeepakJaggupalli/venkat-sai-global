import "server-only";

import { sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/modules/identity/session";
import { isFeatureEnabled } from "@/modules/settings";

import { getConsentVersion, isExcludedFromTracking } from "./config";
import { ANALYTICS_SESSION_COOKIE, CONSENT_COOKIE, effectiveConsent, isRandomId, parseConsentCookie } from "./consent";
import { isAnalyticsEvent, type AnalyticsEvent, type AnalyticsProps } from "./events";
import { isTrackablePath, normalizeAnalyticsPath, sanitizeEventProps } from "./privacy-rules";

/**
 * Server-side conversion tracking, for outcomes the browser cannot see reliably (an application saved,
 * a requirement submitted, a registration verified):
 *
 *   await trackServer("application_submitted", { jobId: job.id });
 *
 * Call it AFTER your transaction commits, from a Server Action or Route Handler (it reads the request
 * cookies). It is a no-op unless the visitor has analytics consent and an active analytics session
 * (cookie vsg_sid, set by the tracker), analytics is switched on, and the signed-in person is neither
 * staff nor a minor. It never throws. Props follow the same rules as track(): non-personal only.
 */
export async function trackServer(event: AnalyticsEvent, props?: AnalyticsProps, opts: { path?: string } = {}): Promise<void> {
  try {
    if (!isAnalyticsEvent(event)) return;
    const [jar, h] = await Promise.all([cookies(), headers()]);
    const sessionId = jar.get(ANALYTICS_SESSION_COOKIE)?.value;
    if (!isRandomId(sessionId)) return;

    const stored = parseConsentCookie(jar.get(CONSENT_COOKIE)?.value);
    const consent = effectiveConsent(stored, await getConsentVersion(), h.get("sec-gpc")?.trim() === "1");
    if (!consent.analytics) return;
    if (!(await isFeatureEnabled("analytics.first_party"))) return;
    if (await isExcludedFromTracking(await getCurrentUser())) return;

    const rawPath = opts.path ?? h.get("x-vsg-pathname");
    const normalized = normalizeAnalyticsPath(rawPath);
    const path = normalized && isTrackablePath(normalized) ? normalized : null;
    await recordServerEvent({ sessionId, name: event, path, props: sanitizeEventProps(props) });
  } catch (error) {
    logger.warn("Server-side analytics event was not recorded", { error, event });
  }
}

/**
 * Insert a server-side event. Attributed to the analytics session when that session exists (its counters
 * are updated and it is no longer a bounce); otherwise stored without a session. Exported for tests.
 */
export async function recordServerEvent(input: {
  sessionId: string | null;
  name: AnalyticsEvent;
  path: string | null;
  props: Record<string, string | number | boolean | null>;
  occurredAt?: Date;
}): Promise<{ attributed: boolean }> {
  const occurredAt = input.occurredAt ?? new Date();
  const props = JSON.stringify(input.props);
  const result = await db.execute<{ attributed: boolean }>(sql`
    with s as (
      update analytics_sessions set
        events = events + 1,
        is_bounce = false,
        last_seen_at = greatest(last_seen_at, ${occurredAt}::timestamptz),
        duration_seconds = greatest(0, round(extract(epoch from greatest(last_seen_at, ${occurredAt}::timestamptz) - started_at)))::int
      where id = ${input.sessionId}
      returning id, visitor_id
    ), ins as (
      insert into analytics_events (session_id, visitor_id, name, source, path, props, occurred_at)
      select s.id, s.visitor_id, ${input.name}, 'server', ${input.path}, ${props}::jsonb, ${occurredAt}::timestamptz from s
      union all
      select null, null, ${input.name}, 'server', ${input.path}, ${props}::jsonb, ${occurredAt}::timestamptz
      where not exists (select 1 from s)
      returning session_id
    )
    select (session_id is not null) as attributed from ins
  `);
  return { attributed: result.rows[0]?.attributed === true };
}
