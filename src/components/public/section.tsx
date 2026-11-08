import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SectionTone = "white" | "subtle" | "navy" | "teal" | "yellow";

const TONE: Record<SectionTone, string> = {
  white: "bg-white",
  subtle: "bg-surface-subtle",
  navy: "band-dark bg-navy-deep text-white",
  yellow: "bg-yellow text-navy",
  teal: "bg-teal-soft",
};

/**
 * A full-width page band with the standard container and vertical rhythm. Labelled by its heading
 * (pass the heading id as `labelledBy`) so screen-reader users can jump between sections.
 */
export function Section({
  id,
  tone = "white",
  labelledBy,
  children,
  className,
  containerClassName,
  "data-testid": testId,
}: {
  id?: string;
  tone?: SectionTone;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  "data-testid"?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("relative py-16 sm:py-20 lg:py-24", TONE[tone], className)} data-testid={testId}>
      <div className={cn("container-page", containerClassName)}>{children}</div>
    </section>
  );
}

/** Small uppercase label above a heading. Never teal/gold text on white: uses the AA "strong" variants. */
export function Eyebrow({ children, onDark = false, className }: { children: ReactNode; onDark?: boolean; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]", onDark ? "text-yellow" : "text-teal-strong", className)}>
      <span aria-hidden="true" className={cn("h-1 w-6 rounded-full", onDark ? "bg-yellow" : "bg-red")} />
      {children}
    </p>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  action,
  align = "start",
  onDark = false,
  as: Heading = "h2",
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  action?: ReactNode;
  align?: "start" | "center";
  onDark?: boolean;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        align === "center" ? "items-center text-center" : "md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow ? <Eyebrow onDark={onDark} className={align === "center" ? "justify-center" : undefined}>{eyebrow}</Eyebrow> : null}
        <Heading
          id={id}
          className={cn(
            "mt-3 text-balance font-display text-4xl sm:text-5xl",
            onDark ? "text-white" : "text-navy",
          )}
        >
          {title}
        </Heading>
        {intro ? <div className={cn("mt-4 text-pretty text-base leading-relaxed sm:text-lg", onDark ? "text-white/75" : "text-muted-foreground")}>{intro}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
