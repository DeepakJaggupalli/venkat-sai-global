import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { renderActionSlot } from "./action-link";
import type { ActionSlot } from "./types";

type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Header action (link action or custom element), aligned to the end of the header row. */
  action?: ActionSlot;
  /** Small icon shown before the title. */
  icon?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Heading level for the title (h2 directly under a page h1; h3 when nested). */
  headingLevel?: "h2" | "h3";
  /** Remove body padding (tables and lists that run edge to edge). */
  flush?: boolean;
  id?: string;
  className?: string;
  contentClassName?: string;
};

/**
 * White content card with an optional header (title, description, action) and footer.
 * Renders a <section> labelled by its title so screen-reader users can navigate by region.
 *
 *   <SectionCard title="Documents" description="Verified documents are visible to employers you apply to." action={{ label: "Upload", href: "…" }}>
 *     <FileList files={files} />
 *   </SectionCard>
 */
export function SectionCard({
  title,
  description,
  action,
  icon,
  footer,
  children,
  headingLevel: Heading = "h2",
  flush = false,
  id,
  className,
  contentClassName,
}: SectionCardProps) {
  const autoId = useId();
  const titleId = `${id ?? autoId}-title`;
  const hasHeader = Boolean(title || description || action);
  return (
    <section
      id={id}
      aria-labelledby={title ? titleId : undefined}
      data-slot="section-card"
      className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xs", className)}
    >
      {hasHeader ? (
        <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5", flush && "pb-4 sm:pb-4")}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon ? (
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal-strong [&_svg]:size-4"
              >
                {icon}
              </span>
            ) : null}
            <div className="min-w-0 space-y-1">
              {title ? (
                <Heading id={titleId} className="font-heading text-base leading-snug font-semibold text-navy">
                  {title}
                </Heading>
              ) : null}
              {description ? <div className="text-sm text-pretty text-muted-foreground">{description}</div> : null}
            </div>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{renderActionSlot(action, { variant: "outline", size: "sm" })}</div> : null}
        </div>
      ) : null}
      {children !== undefined && children !== null ? (
        <div className={cn(flush ? (hasHeader ? "border-t border-border" : "") : cn("px-4 pb-4 sm:px-5 sm:pb-5", hasHeader ? "pt-4" : "pt-4 sm:pt-5"), "min-w-0 flex-1", contentClassName)}>
          {children}
        </div>
      ) : null}
      {footer ? <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-border bg-surface-subtle px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  );
}
