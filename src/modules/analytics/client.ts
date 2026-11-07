"use client";

import type { AnalyticsEvent, AnalyticsProps } from "./events";

/**
 * Client-side event tracking. Safe to call anywhere in client components:
 *
 *   track("cta_click", { cta: "hire_through_venkat_sai", location: "hero" });
 *
 * Events are buffered on window.__vsgAnalyticsQueue and flushed by the consent-aware
 * tracker (mounted in the root layout). Nothing leaves the browser without analytics consent.
 */
type QueuedEvent = { name: AnalyticsEvent; props?: AnalyticsProps; ts: number; path: string };

declare global {
  interface Window {
    __vsgAnalyticsQueue?: QueuedEvent[];
    __vsgAnalyticsFlush?: () => void;
  }
}

export function track(name: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  const queue = (window.__vsgAnalyticsQueue ??= []);
  queue.push({ name, props, ts: Date.now(), path: window.location.pathname });
  if (queue.length > 200) queue.splice(0, queue.length - 200);
  window.__vsgAnalyticsFlush?.();
}
