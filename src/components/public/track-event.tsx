"use client";

import { useEffect, useRef } from "react";

import { track } from "@/modules/analytics/client";
import type { AnalyticsEvent, AnalyticsProps } from "@/modules/analytics/events";

/**
 * Records one analytics event when the page mounts (e.g. `service_view { service: slug }`).
 * Props must be non-personal (slugs, country codes). Renders nothing. Skipped for CMS previews.
 */
export function TrackEvent({ name, props, disabled = false }: { name: AnalyticsEvent; props?: AnalyticsProps; disabled?: boolean }) {
  const sent = useRef(false);
  const key = JSON.stringify(props ?? {});
  useEffect(() => {
    if (disabled || sent.current) return;
    sent.current = true;
    track(name, JSON.parse(key) as AnalyticsProps);
  }, [name, key, disabled]);
  return null;
}
