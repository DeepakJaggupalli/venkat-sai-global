import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ProgressTone = "brand" | "success" | "warning" | "danger";

/** Fill + same-ramp track (the unfilled part is a lighter step of the fill's own hue). */
const RING_TONES: Record<ProgressTone, { fill: string; track: string }> = {
  brand: { fill: "stroke-teal-strong", track: "stroke-teal-soft" },
  success: { fill: "stroke-success", track: "stroke-success-soft" },
  warning: { fill: "stroke-warning", track: "stroke-warning-soft" },
  danger: { fill: "stroke-danger", track: "stroke-danger-soft" },
};

const RING_SIZES = {
  sm: { box: 40, stroke: 4, text: "text-[0.6875rem]" },
  md: { box: 64, stroke: 6, text: "text-sm" },
  lg: { box: 96, stroke: 8, text: "text-xl" },
} as const;

export function clampPercent(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

type ProgressRingProps = {
  /** 0–100. */
  value: number | null | undefined;
  /** Accessible name, e.g. "Profile completion". */
  label: string;
  size?: keyof typeof RING_SIZES;
  tone?: ProgressTone;
  /** Show the percentage in the centre (default true from `md`). */
  showValue?: boolean;
  className?: string;
};

/**
 * Circular progress (SVG attributes only — no inline styles).
 *
 *   <ProgressRing value={profile.profileCompleteness} label="Profile completion" />
 */
export function ProgressRing({ value, label, size = "md", tone = "brand", showValue, className }: ProgressRingProps) {
  const pct = clampPercent(value);
  const { box, stroke, text } = RING_SIZES[size];
  const r = (box - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = box / 2;
  const tones = RING_TONES[tone];
  const withValue = showValue ?? size !== "sm";
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%`}
      data-slot="progress-ring"
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
        <circle cx={center} cy={center} r={r} fill="none" strokeWidth={stroke} className={tones.track} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${center} ${center})`}
          className={cn(tones.fill, "transition-[stroke-dashoffset] duration-500 ease-out")}
        />
      </svg>
      {withValue ? <span className={cn("absolute font-semibold text-foreground", text)}>{pct}%</span> : null}
    </span>
  );
}

export type CompletenessItem = {
  id: string;
  label: string;
  done: boolean;
  /** Where to complete it (e.g. "/talent/profile/documents"). */
  href?: string;
  hint?: string;
};

type CompletenessMeterProps = {
  title?: string;
  description?: ReactNode;
  items: CompletenessItem[];
  /** Override the computed percentage (e.g. the stored profileCompleteness score). */
  value?: number;
  /** Show at most this many outstanding items. */
  maxOutstanding?: number;
  completeText?: string;
  className?: string;
};

/** Percentage of done items (pure; exported for tests). */
export function completeness(items: readonly CompletenessItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

/**
 * Profile-strength card: ring + the next steps that would raise it. Values come from props only.
 *
 *   <CompletenessMeter title="Profile strength" items={[{ id: "photo", label: "Add a profile photo", done: false, href: "/talent/profile" }]} />
 */
export function CompletenessMeter({
  title = "Profile completion",
  description,
  items,
  value,
  maxOutstanding = 4,
  completeText = "Everything is complete.",
  className,
}: CompletenessMeterProps) {
  const pct = clampPercent(value ?? completeness(items));
  const outstanding = items.filter((i) => !i.done);
  const done = items.length - outstanding.length;
  return (
    <div data-slot="completeness-meter" className={cn("flex flex-col gap-4 sm:flex-row sm:items-start", className)}>
      <ProgressRing value={pct} label={title} size="lg" tone={pct >= 100 ? "success" : "brand"} />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="font-heading text-sm font-semibold text-navy">{title}</p>
          <p className="text-xs text-muted-foreground">
            {done} of {items.length} steps done
          </p>
          {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {outstanding.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <CheckCircle2 aria-hidden="true" className="size-4 text-teal-strong" />
            {completeText}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {outstanding.slice(0, maxOutstanding).map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  {item.href ? (
                    <Link href={item.href} className="font-medium text-teal-strong underline-offset-2 hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{item.label}</span>
                  )}
                  {item.hint ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
                </span>
              </li>
            ))}
            {outstanding.length > maxOutstanding ? (
              <li className="pl-6 text-xs text-muted-foreground">and {outstanding.length - maxOutstanding} more</li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}
