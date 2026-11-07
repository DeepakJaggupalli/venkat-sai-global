import { Suspense } from "react";

import { getAnalyticsClientConfig } from "@/modules/analytics/config";

import { AnalyticsTrackerClient } from "./analytics-tracker-client";

/**
 * Consent-aware first-party analytics tracker (page views, heatmap clicks, scroll depth, form starts and
 * submits, the `track()` queue → /api/v1/collect) plus the optional GA4 / Clarity loaders. Mounted once in
 * the root layout. This server wrapper reads the feature flags, settings, the CSP nonce (x-nonce) and the
 * signed-in person (staff and minors are never tracked) and hands the result to the client component.
 */
export async function AnalyticsTracker() {
  const config = await getAnalyticsClientConfig();
  return (
    <Suspense fallback={null}>
      <AnalyticsTrackerClient config={config} />
    </Suspense>
  );
}
