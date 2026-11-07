import type { ComponentProps } from "react";

import { BRAND } from "@/config/site";
import { cn } from "@/lib/utils";

import { LOCKUP_WIDTH, logoPalette, MARK, MARK_SIZE, TILE, WORDMARK, WORDMARK_WIDTH, type LogoVariant } from "./logo-geometry";

export type { LogoVariant } from "./logo-geometry";

type SvgBaseProps = Omit<ComponentProps<"svg">, "children" | "viewBox" | "role">;

export type LogoA11yProps = {
  /** Accessible name (defaults to the brand name). Ignored when `decorative`. */
  title?: string;
  /**
   * Hide from assistive technology — use when the logo sits inside a link or heading
   * that already carries the brand name.
   */
  decorative?: boolean;
};

function a11yProps({ title, decorative }: LogoA11yProps) {
  return decorative ? ({ "aria-hidden": true, focusable: false } as const) : ({ role: "img", "aria-label": title ?? BRAND.name } as const);
}

/** Tile + glyph, drawn in a 48 × 48 coordinate space starting at (offsetX, 0). */
function MarkShapes({ variant, offsetX = 0 }: { variant: LogoVariant; offsetX?: number }) {
  const palette = logoPalette(variant);
  const tile = TILE[variant];
  return (
    <g transform={offsetX ? `translate(${offsetX} 0)` : undefined}>
      <rect
        x={tile.x}
        y={tile.y}
        width={tile.size}
        height={tile.size}
        rx={tile.rx}
        fill={tile.fill}
        fillOpacity={tile.fillOpacity}
        stroke={tile.stroke ?? undefined}
        strokeOpacity={tile.stroke ? tile.strokeOpacity : undefined}
      />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {MARK.arcPaths.map((d) => (
          <path key={d} d={d} stroke={palette.arc} strokeWidth={MARK.arcWidth} />
        ))}
        <path d={MARK.pathD} stroke={palette.path} strokeWidth={MARK.pathWidth} />
      </g>
      <circle cx={MARK.spark.cx} cy={MARK.spark.cy} r={MARK.spark.r} fill={palette.spark} />
    </g>
  );
}

function WordmarkText({ variant, offsetX = 0 }: { variant: LogoVariant; offsetX?: number }) {
  const palette = logoPalette(variant);
  const secondaryX = offsetX + WORDMARK.primary.length + WORDMARK.wordGap;
  return (
    <g className="font-heading" fontSize={WORDMARK.fontSize}>
      <text
        x={offsetX}
        y={WORDMARK.baseline}
        fill={palette.primaryText}
        fontWeight={WORDMARK.primary.weight}
        textLength={WORDMARK.primary.length}
        lengthAdjust="spacing"
      >
        {WORDMARK.primary.text}
      </text>
      <text
        x={secondaryX}
        y={WORDMARK.baseline}
        fill={palette.secondaryText}
        fontWeight={WORDMARK.secondary.weight}
        textLength={WORDMARK.secondary.length}
        lengthAdjust="spacing"
      >
        {WORDMARK.secondary.text}
      </text>
    </g>
  );
}

export type LogoMarkProps = SvgBaseProps & LogoA11yProps & { variant?: LogoVariant };

/**
 * The Venkat Sai Global mark (square). Size it with a height class, e.g. `className="size-8"`.
 * Legible from 20px upwards.
 */
export function LogoMark({ variant = "onLight", title, decorative, className, ...props }: LogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      className={cn("shrink-0", className)}
      {...a11yProps({ title, decorative })}
      {...props}
    >
      <MarkShapes variant={variant} />
    </svg>
  );
}

export type LogoWordmarkProps = SvgBaseProps & LogoA11yProps & { variant?: LogoVariant };

/** The wordmark on its own ("Venkat Sai Global"). Size it by height, e.g. `className="h-6 w-auto"`. */
export function LogoWordmark({ variant = "onLight", title, decorative, className, ...props }: LogoWordmarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WORDMARK_WIDTH} ${MARK_SIZE}`}
      className={cn("shrink-0 overflow-visible", className)}
      {...a11yProps({ title, decorative })}
      {...props}
    >
      <WordmarkText variant={variant} />
    </svg>
  );
}

export type LogoProps = SvgBaseProps &
  LogoA11yProps & {
    variant?: LogoVariant;
    /** `full` = mark + wordmark lockup (default), `mark` = mark only. */
    layout?: "full" | "mark";
  };

/**
 * The Venkat Sai Global logo.
 *
 *   <Logo className="h-8 w-auto" />                       // full lockup on light backgrounds
 *   <Logo variant="onDark" className="h-9 w-auto" />      // footer / navy surfaces
 *   <Logo layout="mark" className="size-8" decorative />  // inside a labelled link
 */
export function Logo({ variant = "onLight", layout = "full", title, decorative, className, ...props }: LogoProps) {
  if (layout === "mark") {
    return <LogoMark variant={variant} title={title} decorative={decorative} className={className} {...props} />;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LOCKUP_WIDTH} ${MARK_SIZE}`}
      className={cn("shrink-0 overflow-visible", className)}
      {...a11yProps({ title, decorative })}
      {...props}
    >
      <MarkShapes variant={variant} />
      <WordmarkText variant={variant} offsetX={MARK_SIZE + WORDMARK.markGap} />
    </svg>
  );
}
