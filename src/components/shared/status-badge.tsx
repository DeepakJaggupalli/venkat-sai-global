import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { resolveStatus, type StatusDomain, type StatusPreset } from "./status-presets";
import { TONE_STYLES, type Tone } from "./tones";

type StatusBadgeProps = {
  /** Raw status value from the database (e.g. "under_review"). Ignored when `children` is given. */
  status?: string | null;
  /** Which preset maps the status to a tone and label. Defaults to the generic lifecycle map. */
  domain?: StatusDomain;
  /** Force a tone (custom badges, or overriding a preset). */
  tone?: Tone;
  /** Custom wording per status for a specific audience, e.g. `{ rejected: { tone: "neutral", label: "Closed" } }`. */
  overrides?: StatusPreset;
  /** Custom label content (takes precedence over the resolved label). */
  children?: ReactNode;
  /** Decorative leading dot (the text label always carries the meaning). */
  dot?: boolean;
  /** Optional leading icon (lucide), replaces the dot. */
  icon?: ReactNode;
  size?: "sm" | "md";
  /** Extra text for screen readers, e.g. "Application status:". */
  srPrefix?: string;
  className?: string;
};

/**
 * Pill badge for a status. Colour is never the only signal: the label text always names the state.
 *
 *   <StatusBadge status={job.status} domain="job" />
 *   <StatusBadge status="pending_staff" domain="ticket" />
 *   <StatusBadge tone="gold">Featured</StatusBadge>
 */
export function StatusBadge({
  status,
  domain = "generic",
  tone,
  overrides,
  children,
  dot = true,
  icon,
  size = "md",
  srPrefix,
  className,
}: StatusBadgeProps) {
  const resolved = resolveStatus(status, domain, overrides);
  const finalTone = tone ?? resolved.tone;
  const styles = TONE_STYLES[finalTone];
  return (
    <span
      data-slot="status-badge"
      data-tone={finalTone}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-2 text-[0.6875rem]" : "h-6 px-2.5 text-xs",
        styles.soft,
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="contents">
          {icon}
        </span>
      ) : dot ? (
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", styles.dot)} />
      ) : null}
      {srPrefix ? <span className="sr-only">{srPrefix} </span> : null}
      {children ?? resolved.label}
    </span>
  );
}
