import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SectionCardLink = { label: string; href: string };

export type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** "View all" style text link at the end of the header (or any element, e.g. a client button). */
  action?: SectionCardLink | ReactNode;
  icon?: LucideIcon;
  /** h2 directly under the dashboard header (default); h3 when nested. */
  headingLevel?: "h2" | "h3";
  /** No body padding (lists that run edge to edge). */
  flush?: boolean;
  id?: string;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
};

function isLink(value: unknown): value is SectionCardLink {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "href" in value && "label" in value && typeof (value as SectionCardLink).href === "string";
}

/** "View all →" text link with a 44px target (used by SectionCard headers and lists). */
export function SectionLink({ link, className }: { link: SectionCardLink; className?: string }) {
  return (
    <Link
      href={link.href}
      className={cn(
        "group/sl -mr-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold whitespace-nowrap text-accent-text hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {link.label}
      <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover/sl:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

/**
 * Dashboard card (DESIGN.md: white, hairline border, 22px radius, soft shadow) with an optional header.
 * A <section> labelled by its title so screen-reader users can jump between dashboard areas. Server component.
 * (The data-heavy pages keep using `@/components/shared/section-card`.)
 */
export function SectionCard({ title, description, action, icon: Icon, headingLevel: Heading = "h2", flush = false, id, children, className, contentClassName }: SectionCardProps) {
  const autoId = useId();
  const titleId = `${id ?? autoId}-title`;
  const hasHeader = Boolean(title || description || action);
  return (
    <section
      id={id}
      aria-labelledby={title ? titleId : undefined}
      data-slot="dashboard-section"
      className={cn("flex min-w-0 flex-col rounded-[22px] border border-border bg-white shadow-card", className)}
    >
      {hasHeader ? (
        <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5", flush ? "pb-3" : "")}>
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text [&_svg]:size-[18px]">
                <Icon />
              </span>
            ) : null}
            <div className="min-w-0 space-y-0.5">
              {title ? (
                <Heading id={titleId} className="font-heading text-lg leading-snug font-bold text-foreground">
                  {title}
                </Heading>
              ) : null}
              {description ? <div className="text-sm text-pretty text-muted-foreground">{description}</div> : null}
            </div>
          </div>
          {action ? <div className="flex shrink-0 items-center">{isLink(action) ? <SectionLink link={action} /> : action}</div> : null}
        </div>
      ) : null}
      {children !== undefined && children !== null ? (
        <div className={cn("min-w-0 flex-1", flush ? "" : cn("px-4 pb-4 sm:px-5 sm:pb-5", hasHeader ? "pt-4" : "pt-4 sm:pt-5"), contentClassName)}>{children}</div>
      ) : null}
    </section>
  );
}
