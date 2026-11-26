import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { CountUp } from "./count-up";
import { DASH_MOTION } from "./motion";

export type StatTileTone = "default" | "attention" | "positive";

export type StatTileProps = {
  /** What is counted, sentence case: "CVs to call back". */
  label: string;
  /** A real number from the database (counts up), a preformatted string (e.g. money with its currency), or null ("—"). */
  value: number | string | null;
  /** The whole tile links here (the list behind the number). */
  href?: string | null;
  /** Small line under the label: "3 new today". */
  hint?: ReactNode;
  /** "attention" marks work that needs action (only while the number is above zero); "positive" a good outcome. */
  tone?: StatTileTone;
  icon?: LucideIcon;
  /** Unit after the number: "days". */
  unit?: string;
  /** Text of the attention pill. Default "Needs action". */
  attentionLabel?: string;
  className?: string;
};

/** Attention styling only while there is something to act on (a zero never shouts). */
export function isAttentionValue(tone: StatTileTone, value: StatTileProps["value"]): boolean {
  if (tone !== "attention") return false;
  return typeof value === "number" ? value > 0 : value !== null && value.trim() !== "" && value.trim() !== "0";
}

/**
 * One headline number. Phone-first: big tabular digits, label, optional hint; the whole tile is a link.
 * Status is never colour-only: attention tiles carry a "Needs action" pill. Server component.
 */
export function StatTile({ label, value, href, hint, tone = "default", icon: Icon, unit, attentionLabel = "Needs action", className }: StatTileProps) {
  const attention = isAttentionValue(tone, value);
  const body = (
    <>
      <span className="flex min-h-8 items-start justify-between gap-2">
        {Icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
              attention ? "bg-warning-soft text-warning-strong" : tone === "positive" ? "bg-success-soft text-success-strong" : "bg-accent-soft text-accent-text",
            )}
          >
            <Icon />
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        {attention ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-warning-soft px-2 text-[11px] font-semibold whitespace-nowrap text-warning-strong">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
            {attentionLabel}
          </span>
        ) : null}
      </span>
      <span className="mt-3 block font-display text-[2rem] leading-none text-foreground sm:text-[2.5rem]">
        {typeof value === "number" ? (
          <CountUp value={value} />
        ) : value === null || value.trim() === "" ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not available</span>
          </>
        ) : (
          <span className="tabular-nums">{value}</span>
        )}
        {unit ? <span className="ml-1 text-base font-semibold tracking-normal text-muted-foreground">{unit}</span> : null}
      </span>
      <span className="mt-2 block text-sm leading-snug font-medium text-pretty text-foreground/80">{label}</span>
      {hint ? <span className="mt-1 block text-xs leading-snug text-pretty text-muted-foreground">{hint}</span> : null}
    </>
  );
  const frame = cn(
    "relative flex min-w-0 flex-col rounded-[20px] border bg-white p-4 shadow-card sm:p-5",
    attention ? "border-[color:color-mix(in_oklab,var(--warning),white_55%)]" : "border-border",
    className,
  );
  if (!href) {
    return (
      <div data-slot="stat-tile" data-attention={attention || undefined} className={frame}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      data-slot="stat-tile"
      data-attention={attention || undefined}
      className={cn(
        frame,
        "transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      {body}
    </Link>
  );
}

/** Tiles in a grid: 2 per row on phones, `columns` (default 4) from large screens. Tiles rise in gently. */
export function StatGrid({ children, columns = 4, label, className }: { children: ReactNode; columns?: 2 | 3 | 4; label?: string; className?: string }) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      data-slot="stat-grid"
      className={cn(DASH_MOTION.stagger, "grid grid-cols-2 gap-3 sm:gap-4", columns === 4 && "lg:grid-cols-4", columns === 3 && "lg:grid-cols-3", className)}
    >
      {children}
    </div>
  );
}
