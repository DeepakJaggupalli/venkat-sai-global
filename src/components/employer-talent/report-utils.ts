/**
 * Pure calculations for the Employer Portal recruitment reports (client-safe). The page loads raw,
 * organisation-scoped rows; these helpers turn them into figures. Nothing here invents data: an
 * empty input gives empty output or null.
 */

/** Funnel steps by workflow stage category rank (an application "reached" a step if it ever got there). */
export const FUNNEL_STEPS = [
  { key: "applied", label: "Applied", categories: ["applied", "screening", "assessment", "interview", "decision", "offer", "pre_joining", "joined"] },
  { key: "screened", label: "Shortlisted / screened", categories: ["screening", "assessment", "interview", "decision", "offer", "pre_joining", "joined"] },
  { key: "interviewed", label: "Interviewed", categories: ["interview", "decision", "offer", "pre_joining", "joined"] },
  { key: "offered", label: "Offered", categories: ["offer", "pre_joining", "joined"] },
  { key: "joined", label: "Joined", categories: ["joined"] },
] as const;

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]["key"];

/** Category rank used to find the furthest step an application reached (exit categories rank 0). */
const CATEGORY_RANK: Record<string, number> = {
  applied: 1,
  screening: 2,
  assessment: 3,
  interview: 4,
  decision: 5,
  offer: 6,
  pre_joining: 7,
  joined: 8,
};

const STEP_MIN_RANK: Record<FunnelStepKey, number> = { applied: 1, screened: 2, interviewed: 4, offered: 6, joined: 8 };

export type StageReachRow = { jobId: string; applicationId: string; category: string };

export type JobFunnel = { jobId: string; counts: Record<FunnelStepKey, number>; total: number };

/**
 * Per job: how many applications reached each funnel step. Every application counts as "applied"
 * (it exists), even if its history only holds exit stages.
 */
export function computeFunnels(rows: readonly StageReachRow[]): JobFunnel[] {
  const furthest = new Map<string, { jobId: string; rank: number }>();
  for (const r of rows) {
    const rank = Math.max(CATEGORY_RANK[r.category] ?? 0, 1);
    const prev = furthest.get(r.applicationId);
    if (!prev || rank > prev.rank) furthest.set(r.applicationId, { jobId: r.jobId, rank });
  }
  const byJob = new Map<string, JobFunnel>();
  for (const { jobId, rank } of furthest.values()) {
    const funnel = byJob.get(jobId) ?? { jobId, counts: { applied: 0, screened: 0, interviewed: 0, offered: 0, joined: 0 }, total: 0 };
    funnel.total += 1;
    for (const step of FUNNEL_STEPS) if (rank >= STEP_MIN_RANK[step.key]) funnel.counts[step.key] += 1;
    byJob.set(jobId, funnel);
  }
  return [...byJob.values()];
}

/** Sum of several funnels (whole organisation). */
export function totalFunnel(funnels: readonly JobFunnel[]): Record<FunnelStepKey, number> {
  const out: Record<FunnelStepKey, number> = { applied: 0, screened: 0, interviewed: 0, offered: 0, joined: 0 };
  for (const f of funnels) for (const step of FUNNEL_STEPS) out[step.key] += f.counts[step.key];
  return out;
}

/** Share of `part` in `whole` as a ratio (0–1), or null when there is nothing to divide. */
export function ratio(part: number, whole: number): number | null {
  if (!whole || whole <= 0) return null;
  return part / whole;
}

/** Whole days between two instants (never negative); null when either is missing. */
export function daysBetween(from: Date | string | null | undefined, to: Date | string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
}

export function average(values: readonly number[]): number | null {
  const list = values.filter((v) => Number.isFinite(v));
  if (!list.length) return null;
  return Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
}

/**
 * Employers never learn which recruitment partner sourced a hire, so partner-, staff- and
 * import-sourced hires are reported together as sourced by Venkat Sai.
 */
export const HIRE_SOURCE_GROUPS = [
  { key: "direct", label: "Applied directly", sources: ["direct"] },
  { key: "venkat_sai", label: "Sourced by Venkat Sai (incl. recruitment partners)", sources: ["partner", "staff_assigned", "import"] },
  { key: "referral", label: "Referral", sources: ["referral"] },
  { key: "campus", label: "Campus", sources: ["campus"] },
] as const;

export type HireSourceKey = (typeof HIRE_SOURCE_GROUPS)[number]["key"];

export function hireSourceGroup(source: string): HireSourceKey {
  for (const g of HIRE_SOURCE_GROUPS) if ((g.sources as readonly string[]).includes(source)) return g.key;
  return "venkat_sai";
}

export function groupHireSources(rows: readonly { source: string; value: number }[]): { key: HireSourceKey; label: string; value: number }[] {
  const totals = new Map<HireSourceKey, number>();
  for (const r of rows) totals.set(hireSourceGroup(r.source), (totals.get(hireSourceGroup(r.source)) ?? 0) + r.value);
  return HIRE_SOURCE_GROUPS.map((g) => ({ key: g.key, label: g.label, value: totals.get(g.key) ?? 0 }));
}

/** RFC 4180 CSV cell; also neutralises spreadsheet formula injection (=, +, -, @ at the start). */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
