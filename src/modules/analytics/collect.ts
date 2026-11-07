import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { analyticsEvents, analyticsHeatmapPoints, analyticsScrollDepth } from "@/db/schema";
import { classifyUserAgent } from "@/lib/request";

import { consentLevelFor, type ConsentCategories } from "./consent";
import { isAnalyticsEvent } from "./events";
import {
  isValidReferrerDomain,
  isTrackablePath,
  normalizeAnalyticsPath,
  normalizeUtmValue,
  resolveOccurredAt,
  sanitizeEventProps,
  sanitizeSelectorString,
  type SafeEventProps,
} from "./privacy-rules";
import type { CollectPayload } from "./schemas";

/**
 * Ingestion of one collector batch (POST /api/v1/collect). The route handler has already checked the
 * origin, size, rate limit, bot traffic, feature flag and the visitor's consent cookie; this function
 * re-applies the privacy rules to every value (the browser is never trusted) and writes the session,
 * events, heatmap points and scroll depth in one transaction.
 */

export type CollectContext = {
  /** Raw user agent — used only to derive device type / browser / OS family; never stored. */
  userAgent: string | null;
  /** Edge geo header value (x-vercel-ip-country / cf-ipcountry). */
  countryHeader: string | null;
  /** Effective consent from the vsg_consent cookie (analytics must be true). */
  consent: ConsentCategories;
  /** Signed-in user allowed to be linked to the session (already checked: not staff, not a minor). */
  userId: string | null;
  heatmapsEnabled: boolean;
  now?: Date;
};

export type IngestResult =
  | { stored: true; events: number; pageViews: number; heatmapPoints: number; scrollRecords: number }
  | { stored: false; reason: "bot" | "no_consent" | "nothing_to_store" };

/** ISO country code from an edge header; unknown / anonymiser codes (XX, T1, ZZ…) are dropped. */
export function countryFromHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || ["XX", "T1", "ZZ", "EU", "AP", "A1", "A2", "O1"].includes(code)) return null;
  return code;
}

function deviceTypeFor(ua: ReturnType<typeof classifyUserAgent>): "mobile" | "tablet" | "desktop" | "other" {
  return ua.deviceType === "mobile" || ua.deviceType === "tablet" || ua.deviceType === "desktop" ? ua.deviceType : "other";
}

type PreparedEvent = { name: string; path: string; props: SafeEventProps; occurredAt: Date };

/** Validate and normalise the batch contents (pure apart from the clock). Exported for tests. */
export function prepareBatch(payload: CollectPayload, opts: { now: Date; heatmapsEnabled: boolean }) {
  const { now } = opts;
  const events: PreparedEvent[] = [];
  for (const e of payload.events) {
    if (!isAnalyticsEvent(e.name)) continue;
    const path = normalizeAnalyticsPath(e.path);
    if (!path || !isTrackablePath(path)) continue;
    events.push({ name: e.name, path, props: sanitizeEventProps(e.props), occurredAt: resolveOccurredAt(e.ts, payload.sentAt, now) });
  }
  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const heatmap = opts.heatmapsEnabled
    ? payload.heatmap.flatMap((p) => {
        const path = normalizeAnalyticsPath(p.path);
        if (!path || !isTrackablePath(path)) return [];
        const docHeight = Math.max(1, p.h);
        return [
          {
            path,
            viewportWidthBucket: p.vw,
            xPct: p.x,
            yPx: Math.min(p.y, docHeight),
            docHeight,
            selector: sanitizeSelectorString(p.sel),
            kind: p.kind,
            occurredAt: resolveOccurredAt(p.ts, payload.sentAt, now),
          },
        ];
      })
    : [];

  // One row per (session, path): keep the deepest value of the batch (the upsert keeps the deepest overall).
  const scrollByPath = new Map<string, { path: string; maxDepthPct: number; occurredAt: Date }>();
  for (const s of payload.scroll) {
    const path = normalizeAnalyticsPath(s.path);
    if (!path || !isTrackablePath(path)) continue;
    const existing = scrollByPath.get(path);
    if (!existing || s.depth > existing.maxDepthPct) {
      scrollByPath.set(path, { path, maxDepthPct: s.depth, occurredAt: resolveOccurredAt(s.ts, payload.sentAt, now) });
    }
  }

  let landingPath: string | null = null;
  let referrerDomain: string | null = null;
  const utm = { source: null as string | null, medium: null as string | null, campaign: null as string | null, term: null as string | null, content: null as string | null };
  let locale: string | null = null;
  if (payload.start) {
    const lp = normalizeAnalyticsPath(payload.start.landingPath);
    landingPath = lp && isTrackablePath(lp) ? lp : null;
    const ref = payload.start.referrer?.trim().toLowerCase() ?? null;
    referrerDomain = ref && isValidReferrerDomain(ref) ? ref : null;
    if (payload.start.utm) {
      utm.source = normalizeUtmValue(payload.start.utm.source);
      utm.medium = normalizeUtmValue(payload.start.utm.medium);
      utm.campaign = normalizeUtmValue(payload.start.utm.campaign);
      utm.term = normalizeUtmValue(payload.start.utm.term);
      utm.content = normalizeUtmValue(payload.start.utm.content);
    }
    locale = payload.start.locale ?? null;
  }

  const pageViewEvents = events.filter((e) => e.name === "page_view");
  if (!landingPath && pageViewEvents[0]) landingPath = pageViewEvents[0].path;
  const exitPath = pageViewEvents.length ? pageViewEvents[pageViewEvents.length - 1]!.path : null;

  const times = [...events.map((e) => e.occurredAt), ...heatmap.map((h) => h.occurredAt), ...[...scrollByPath.values()].map((s) => s.occurredAt)];
  const firstAt = times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : now;
  const lastAt = times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : now;

  return {
    events,
    pageViews: pageViewEvents.length,
    heatmap,
    scroll: [...scrollByPath.values()],
    session: { landingPath, exitPath, referrerDomain, utm, locale, isNewVisitor: payload.start?.newVisitor === true, firstAt, lastAt },
  };
}

/** Store one collector batch. Never stores IP addresses or the user-agent string. */
export async function ingestCollectBatch(payload: CollectPayload, ctx: CollectContext): Promise<IngestResult> {
  const ua = classifyUserAgent(ctx.userAgent);
  if (!ctx.userAgent || ua.deviceType === "bot") return { stored: false, reason: "bot" };
  if (!ctx.consent.analytics) return { stored: false, reason: "no_consent" };

  const now = ctx.now ?? new Date();
  const batch = prepareBatch(payload, { now, heatmapsEnabled: ctx.heatmapsEnabled });
  if (!payload.start && !batch.events.length && !batch.heatmap.length && !batch.scroll.length) {
    return { stored: false, reason: "nothing_to_store" };
  }

  const consentLevel = consentLevelFor(ctx.consent);
  const visitorId = payload.vid ?? null;
  const country = countryFromHeader(ctx.countryHeader);
  const s = batch.session;

  await db.transaction(async (tx) => {
    const upsert = await tx.execute<{ visitor_id: string | null }>(sql`
      insert into analytics_sessions (
        id, visitor_id, consent_level, user_id, started_at, last_seen_at, landing_path, exit_path, referrer_domain,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content, device_type, browser, os, country_code, locale,
        is_new_visitor, page_views, events, is_bounce, duration_seconds
      ) values (
        ${payload.sid}, ${visitorId}, ${consentLevel}, ${ctx.userId}, ${s.firstAt}, ${s.lastAt}, ${s.landingPath}, ${s.exitPath},
        ${s.referrerDomain}, ${s.utm.source}, ${s.utm.medium}, ${s.utm.campaign}, ${s.utm.term}, ${s.utm.content},
        ${deviceTypeFor(ua)}, ${ua.browser.slice(0, 50)}, ${ua.os.slice(0, 50)}, ${country}, ${s.locale},
        ${s.isNewVisitor}, ${batch.pageViews}, ${batch.events.length},
        ${batch.pageViews <= 1 && batch.events.length <= batch.pageViews},
        ${Math.max(0, Math.round((s.lastAt.getTime() - s.firstAt.getTime()) / 1000))}
      )
      on conflict (id) do update set
        visitor_id = coalesce(analytics_sessions.visitor_id, excluded.visitor_id),
        consent_level = excluded.consent_level,
        user_id = coalesce(excluded.user_id, analytics_sessions.user_id),
        started_at = least(analytics_sessions.started_at, excluded.started_at),
        last_seen_at = greatest(analytics_sessions.last_seen_at, excluded.last_seen_at),
        landing_path = coalesce(analytics_sessions.landing_path, excluded.landing_path),
        exit_path = coalesce(excluded.exit_path, analytics_sessions.exit_path),
        referrer_domain = coalesce(analytics_sessions.referrer_domain, excluded.referrer_domain),
        utm_source = coalesce(analytics_sessions.utm_source, excluded.utm_source),
        utm_medium = coalesce(analytics_sessions.utm_medium, excluded.utm_medium),
        utm_campaign = coalesce(analytics_sessions.utm_campaign, excluded.utm_campaign),
        utm_term = coalesce(analytics_sessions.utm_term, excluded.utm_term),
        utm_content = coalesce(analytics_sessions.utm_content, excluded.utm_content),
        country_code = coalesce(analytics_sessions.country_code, excluded.country_code),
        locale = coalesce(excluded.locale, analytics_sessions.locale),
        is_new_visitor = analytics_sessions.is_new_visitor or excluded.is_new_visitor,
        page_views = analytics_sessions.page_views + excluded.page_views,
        events = analytics_sessions.events + excluded.events,
        is_bounce = (analytics_sessions.page_views + excluded.page_views) <= 1
          and (analytics_sessions.events + excluded.events) <= (analytics_sessions.page_views + excluded.page_views),
        duration_seconds = greatest(0, round(extract(epoch from
          greatest(analytics_sessions.last_seen_at, excluded.last_seen_at) - least(analytics_sessions.started_at, excluded.started_at)
        )))::int
      returning visitor_id
    `);
    const sessionVisitorId = upsert.rows[0]?.visitor_id ?? visitorId;

    if (batch.events.length) {
      await tx.insert(analyticsEvents).values(
        batch.events.map((e) => ({
          sessionId: payload.sid,
          visitorId: sessionVisitorId,
          name: e.name,
          source: "client" as const,
          path: e.path,
          props: e.props,
          occurredAt: e.occurredAt,
        })),
      );
    }
    if (batch.heatmap.length) {
      await tx.insert(analyticsHeatmapPoints).values(batch.heatmap);
    }
    for (const row of batch.scroll) {
      await tx
        .insert(analyticsScrollDepth)
        .values({ sessionId: payload.sid, path: row.path, maxDepthPct: row.maxDepthPct, occurredAt: row.occurredAt })
        .onConflictDoUpdate({
          target: [analyticsScrollDepth.sessionId, analyticsScrollDepth.path],
          set: {
            maxDepthPct: sql`greatest(${analyticsScrollDepth.maxDepthPct}, excluded.max_depth_pct)`,
            occurredAt: sql`greatest(${analyticsScrollDepth.occurredAt}, excluded.occurred_at)`,
          },
        });
    }
  });

  return { stored: true, events: batch.events.length, pageViews: batch.pageViews, heatmapPoints: batch.heatmap.length, scrollRecords: batch.scroll.length };
}
