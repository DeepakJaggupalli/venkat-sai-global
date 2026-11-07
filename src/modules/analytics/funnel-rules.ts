/**
 * Pure funnel rules (client-safe, no database access).
 */
import type { AnalyticsFunnelStep } from "@/db/schema/analytics";

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
const PROP_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** Structural check of stored / submitted steps (2–20, each matching an event and/or a path). */
export function validateFunnelSteps(steps: unknown): steps is AnalyticsFunnelStep[] {
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 20) return false;
  return steps.every((step) => {
    if (!step || typeof step !== "object") return false;
    const s = step as Partial<AnalyticsFunnelStep>;
    if (typeof s.label !== "string" || !s.label.trim() || s.label.length > 80 || !s.match || typeof s.match !== "object") return false;
    const { event, path, props } = s.match;
    if (event === undefined && path === undefined) return false;
    if (event !== undefined && (typeof event !== "string" || !EVENT_NAME_RE.test(event))) return false;
    if (path !== undefined && (typeof path !== "string" || !path.startsWith("/") || /[?#\s]/.test(path) || path.length > 300)) return false;
    if (props !== undefined) {
      if (!props || typeof props !== "object" || Array.isArray(props)) return false;
      for (const [k, v] of Object.entries(props)) {
        if (!PROP_KEY_RE.test(k) || !["string", "number", "boolean"].includes(typeof v)) return false;
      }
    }
    return true;
  });
}

/**
 * Reference implementation of funnel evaluation for one visitor's ordered events (used by tests to check
 * the SQL): step 1 is the first match inside [rangeStart, rangeEnd); each later step is the first match at
 * or after the previous one and no later than step 1 + windowDays. Returns how many steps were reached.
 */
export function stepsReached(
  events: { name: string; path: string | null; props?: Record<string, unknown>; at: Date }[],
  steps: AnalyticsFunnelStep[],
  windowDays: number,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const matches = (e: (typeof sorted)[number], step: AnalyticsFunnelStep): boolean => {
    const m = step.match;
    if (m.event && e.name !== m.event) return false;
    if (m.path) {
      if (m.path.endsWith("*")) {
        if (!e.path || !e.path.startsWith(m.path.slice(0, -1))) return false;
      } else if (e.path !== m.path) return false;
    }
    if (m.props) for (const [k, v] of Object.entries(m.props)) if (e.props?.[k] !== v) return false;
    return true;
  };
  const first = sorted.find((e) => e.at >= rangeStart && e.at < rangeEnd && matches(e, steps[0]!));
  if (!first) return 0;
  const deadline = first.at.getTime() + windowDays * 86_400_000;
  let reached = 1;
  let cursor = first.at.getTime();
  for (let i = 1; i < steps.length; i++) {
    const next = sorted.find((e) => e.at.getTime() >= cursor && e.at.getTime() <= deadline && matches(e, steps[i]!));
    if (!next) break;
    reached += 1;
    cursor = next.at.getTime();
  }
  return reached;
}
