"use client";

import { useEffect, useRef } from "react";

import { track } from "@/modules/analytics/client";
import type { AnalyticsEvent, AnalyticsProps } from "@/modules/analytics/events";

/**
 * Records one analytics event when it mounts (e.g. `job_view`, `application_started`). Pass ids and
 * flags only — never personal data. Re-fires only when `dedupeKey` changes.
 */
export function TrackEvent({ name, props, dedupeKey }: { name: AnalyticsEvent; props?: AnalyticsProps; dedupeKey: string }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === dedupeKey) return;
    sent.current = dedupeKey;
    track(name, props);
    // props are derived from dedupeKey by callers; re-running on identity changes would double-count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, dedupeKey]);
  return null;
}
