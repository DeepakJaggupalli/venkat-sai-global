/**
 * Collector limits shared by the browser tracker and the zod schema (dependency-free so the tracker
 * bundle stays small).
 */
export const COLLECT_LIMITS = {
  /** Request body limit (sendBeacon allows ~64 KB; the tracker splits batches well below it). */
  maxBodyBytes: 64 * 1024,
  maxEvents: 50,
  maxHeatmapPoints: 50,
  maxScrollRecords: 20,
} as const;
