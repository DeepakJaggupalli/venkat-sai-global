import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { DASH_MOTION } from "./motion";

const NF = new Intl.NumberFormat("en-IN");

/** Whole numbers that read the same with or without Indian digit grouping can count up in CSS. */
export function canCountUp(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value < 1000;
}

/**
 * A real number that counts up gently from zero on first paint (CSS only: no JavaScript, no hydration flicker).
 * Screen readers, reduced-motion users and browsers without `@property` get the final value straight away.
 * Values from 1,000 (grouped digits), decimals and negatives render as static formatted text.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const formatted = NF.format(value);
  if (!canCountUp(value)) return <span className={cn("tabular-nums", className)}>{formatted}</span>;
  return (
    <span className={className}>
      <span aria-hidden="true" className={DASH_MOTION.countUp} style={{ "--vsg-count-to": value } as CSSProperties} />
      <span className="sr-only">{formatted}</span>
    </span>
  );
}
