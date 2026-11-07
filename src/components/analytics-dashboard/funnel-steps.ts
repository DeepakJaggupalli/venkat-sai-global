/**
 * Funnel builder state helpers (pure, client-safe; tested in funnel-steps.test.ts).
 */
import type { AnalyticsFunnelStep } from "@/modules/analytics/types";

export type DraftStep = { key: string; label: string; event: string; path: string; props: string };

export type StepPayload = { label: string; event?: string; path?: string; props?: Record<string, string | boolean> };

let counter = 0;
export function draftKey(): string {
  counter += 1;
  return `step-${Date.now().toString(36)}-${counter}`;
}

/** "intent=employer, orgType=employer" → { intent: "employer", orgType: "employer" }; "true"/"false" become booleans. */
export function parseProps(text: string): Record<string, string | boolean> | undefined {
  const out: Record<string, string | boolean> = {};
  for (const part of text.split(/[,\n]/)) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!key || !raw) continue;
    out[key] = raw === "true" ? true : raw === "false" ? false : raw;
  }
  return Object.keys(out).length ? out : undefined;
}

export function formatProps(props: Record<string, string | number | boolean> | undefined): string {
  if (!props) return "";
  return Object.entries(props)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
}

export function toDraft(step: AnalyticsFunnelStep): DraftStep {
  return { key: draftKey(), label: step.label, event: step.match.event ?? "", path: step.match.path ?? "", props: formatProps(step.match.props) };
}

/** Draft → payload accepted by funnelStepSchema (blank fields omitted). */
export function toPayload(step: DraftStep): StepPayload {
  const props = parseProps(step.props);
  return {
    label: step.label.trim(),
    ...(step.event ? { event: step.event } : {}),
    ...(step.path.trim() ? { path: step.path.trim() } : {}),
    ...(props ? { props } : {}),
  };
}

export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= steps.length || from === to) return [...steps];
  const next = [...steps];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
