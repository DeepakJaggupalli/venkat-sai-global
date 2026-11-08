import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Section tones. The site is white with light-grey alternating bands; the legacy dark/colour tone names
 * ("navy", "teal", "yellow") are kept for older call sites and all render as the subtle grey band.
 */
export type SectionTone = "white" | "subtle" | "navy" | "teal" | "yellow";

const TONE: Record<SectionTone, string> = {
  white: "bg-white",
  subtle: "bg-surface-subtle",
  navy: "bg-surface-subtle",
  yellow: "bg-surface-subtle",
  teal: "bg-surface-subtle",
};

/**
 * A full-width page band with the standard container and vertical rhythm (64-80px on phones, 96-112px on
 * desktop). Labelled by its heading (pass the heading id as `labelledBy`) so screen-reader users can jump
 * between sections.
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
    <section id={id} aria-labelledby={labelledBy} className={cn("relative py-16 sm:py-20 lg:py-28", TONE[tone], className)} data-testid={testId}>
      <div className={cn("container-page", containerClassName)}>{children}</div>
    </section>
  );
}

/** Small uppercase label with the accent dot, above a heading (accent TEXT colour, AA on white and grey). */
export function Eyebrow({ children, className }: { children: ReactNode; /** @deprecated no dark bands any more */ onDark?: boolean; className?: string }) {
  return <p className={cn("label-dot", className)}>{children}</p>;
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  action,
  align = "start",
  as: Heading = "h2",
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  action?: ReactNode;
  align?: "start" | "center";
  /** @deprecated no dark bands any more */
  onDark?: boolean;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", align === "center" ? "items-center text-center" : "md:flex-row md:items-end md:justify-between", className)}>
      <div className={cn("max-w-3xl", align === "center" && "mx-auto")}>
        {eyebrow ? <Eyebrow className={align === "center" ? "justify-center" : undefined}>{eyebrow}</Eyebrow> : null}
        <Heading id={id} className="mt-4 scroll-mt-24 text-balance font-display text-[2rem] text-foreground sm:text-[2.75rem] lg:text-[3.25rem]">
          {title}
        </Heading>
        {intro ? (
          <div className={cn("mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg", align === "center" && "mx-auto")}>{intro}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
