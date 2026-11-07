"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useConsent } from "@/components/privacy/use-consent";
import { isPrivateAreaPath, isTrackablePath } from "@/modules/analytics/privacy-rules";
import type { AnalyticsClientConfig } from "@/modules/analytics/types";

import { AnalyticsRuntime, clearAnalyticsIdentifiers } from "./runtime";
import { applyClarityMasking, ga4PageView, isClarityLoaded, isGa4Loaded, loadClarity, loadGa4, revokeClarity, revokeGa4 } from "./third-party";

/** Drop queued track() calls: nothing is kept or sent without analytics consent. */
function discardQueue(): void {
  if (window.__vsgAnalyticsQueue) window.__vsgAnalyticsQueue.length = 0;
}

/**
 * Consent-aware tracker (mounted once by the AnalyticsTracker server wrapper in the root layout).
 * Does nothing until the visitor has given analytics consent; stops and clears its identifiers when consent
 * is withdrawn. Optional GA4 / Clarity load only with their own consent and configuration.
 */
export function AnalyticsTrackerClient({ config }: { config: AnalyticsClientConfig }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const { ready, categories } = useConsent(config.consentVersion);
  const runtimeRef = useRef<AnalyticsRuntime | null>(null);

  const trackable = isTrackablePath(pathname);
  const firstPartyOn = ready && config.enabled && categories.analytics;
  const ga4On = ready && config.ga4MeasurementId !== null && categories.analytics;
  const clarityOn = ready && config.clarityProjectId !== null && categories.session_insights;

  // First-party runtime lifecycle.
  useEffect(() => {
    if (!ready) return;
    if (!firstPartyOn) {
      // No consent (never given, withdrawn, outdated or overridden by GPC): keep nothing.
      window.__vsgAnalyticsFlush = discardQueue;
      discardQueue();
      clearAnalyticsIdentifiers();
      return;
    }
    // Events queued before consent was given are not sent.
    discardQueue();
    const runtime = new AnalyticsRuntime({ heatmaps: config.heatmaps });
    runtimeRef.current = runtime;
    runtime.start();
    return () => {
      runtime.stop();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [ready, firstPartyOn, config.heatmaps]);

  // Page views on route changes (path + whitelisted query parameters).
  useEffect(() => {
    if (firstPartyOn && trackable) runtimeRef.current?.pageView(pathname, search);
  }, [firstPartyOn, trackable, pathname, search]);

  // Google Analytics 4 (analytics consent).
  useEffect(() => {
    if (!ready) return;
    if (ga4On && config.ga4MeasurementId) loadGa4(config.ga4MeasurementId, config.nonce);
    else if (isGa4Loaded()) revokeGa4();
  }, [ready, ga4On, config.ga4MeasurementId, config.nonce]);

  useEffect(() => {
    if (ga4On && trackable) ga4PageView(pathname, search);
  }, [ga4On, trackable, pathname, search]);

  // Microsoft Clarity (session-insights consent). Only started on public pages; masked in signed-in areas.
  useEffect(() => {
    if (!ready) return;
    if (clarityOn && config.clarityProjectId) {
      if (!isClarityLoaded() && trackable && !isPrivateAreaPath(pathname)) loadClarity(config.clarityProjectId, config.nonce);
    } else if (isClarityLoaded()) {
      // Clarity cannot be unloaded from a running page: revoke, then reload so the script is gone.
      revokeClarity();
      window.setTimeout(() => window.location.reload(), 300);
    }
  }, [ready, clarityOn, config.clarityProjectId, config.nonce, trackable, pathname]);

  useEffect(() => {
    if (isClarityLoaded()) applyClarityMasking(!trackable || isPrivateAreaPath(pathname));
  }, [pathname, trackable, clarityOn]);

  return null;
}
