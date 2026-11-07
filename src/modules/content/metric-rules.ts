/**
 * Display rules of public metrics (pure, client-safe, unit-tested).
 *
 * A number reaches the public site only when it is (a) a live count computed from platform records by a
 * code-defined counter, or (b) a manual figure whose current value and as-of date were approved by staff, with
 * evidence recorded. Hidden metrics, figures below their display threshold and anything without a public
 * definition never appear. The database enforces the same guarantee (public_metrics_display_chk); this module
 * re-checks it so a bad row can never leak a number.
 */
import type { PublicMetricMode } from "@/db/schema";

import type { PublicMetric } from "./types";

export type MetricRowForDisplay = {
  key: string;
  label: string;
  mode: PublicMetricMode;
  isVisible: boolean;
  definition: string | null;
  liveQueryKey: string | null;
  manualValue: number | null;
  asOfDate: string | null;
  approvedValue: number | null;
  approvedAsOfDate: string | null;
  approvedAt: Date | null;
  evidenceNote: string | null;
  evidenceFileId: string | null;
  minDisplayValue: number | null;
};

/** The approval snapshot matches the current manual figure and evidence is recorded. */
export function manualApprovalIsCurrent(row: Pick<MetricRowForDisplay, "manualValue" | "asOfDate" | "approvedValue" | "approvedAsOfDate" | "approvedAt" | "evidenceNote" | "evidenceFileId">): boolean {
  return (
    row.approvedAt !== null &&
    row.manualValue !== null &&
    row.asOfDate !== null &&
    row.approvedValue === row.manualValue &&
    row.approvedAsOfDate === row.asOfDate &&
    (row.evidenceFileId !== null || Boolean(row.evidenceNote?.trim()))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * What the public site may show for a metric row, or null.
 * `live` is the computed value of the row's live counter (with the time it was computed) when the row is live.
 */
export function displayableMetric(row: MetricRowForDisplay, live: { value: number; computedAt: Date } | null, knownLiveKeys: ReadonlySet<string>): PublicMetric | null {
  if (!row.isVisible || row.mode === "hidden") return null;
  const definition = row.definition?.trim();
  if (!definition || !row.label.trim()) return null;
  let value: number;
  let asOf: string;
  if (row.mode === "live") {
    if (!row.liveQueryKey || !knownLiveKeys.has(row.liveQueryKey) || !live || !isNonNegativeInteger(live.value)) return null;
    value = live.value;
    asOf = live.computedAt.toISOString().slice(0, 10);
  } else if (row.mode === "manual") {
    if (!manualApprovalIsCurrent(row) || !isNonNegativeInteger(row.approvedValue) || !row.approvedAsOfDate) return null;
    value = row.approvedValue;
    asOf = row.approvedAsOfDate;
  } else {
    return null;
  }
  if (row.minDisplayValue !== null && value < row.minDisplayValue) return null;
  return { key: row.key, label: row.label.trim(), value, definition, asOf, mode: row.mode };
}
