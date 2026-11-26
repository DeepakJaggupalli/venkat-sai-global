import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { cn } from "@/lib/utils";

import { DASH_MOTION } from "./motion";
import type { QuickActionItem } from "./types";

export type QuickActionsProps = {
  /** Cards to show, already filtered by the viewer's permissions. Nothing renders when empty. */
  items: readonly QuickActionItem[];
  /** Section heading (h2 by default). Omit to render the grid alone. */
  title?: string;
  description?: string;
  /** Columns from extra-large screens (phones always 2, tablets and laptops 3). */
  columns?: 3 | 4;
  headingLevel?: "h2" | "h3";
  className?: string;
};

/**
 * Big tappable action cards: icon, label, one-line hint and an optional real count badge.
 * Two columns on phones, three on tablets, three or four on desktop; lift on hover, clear focus ring.
 * Server component.
 */
export function QuickActions({ items, title, description, columns = 4, headingLevel: Heading = "h2", className }: QuickActionsProps) {
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : "Quick actions"}
      data-slot="quick-actions"
      className={cn("min-w-0", className)}
    >
      {title ? (
        <div className="mb-3 space-y-1">
          <Heading id={headingId} className="font-heading text-lg font-bold text-foreground">
            {title}
          </Heading>
          {description ? <p className="text-sm text-pretty text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      <ul className={cn(DASH_MOTION.stagger, "grid grid-cols-2 gap-3 sm:grid-cols-3", columns === 4 && "xl:grid-cols-4")}>
        {items.map((item) => (
          <li key={`${item.href}-${item.label}`} className="min-w-0">
            <QuickActionCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const CARD =
  "group/qa relative flex h-full min-h-[7.5rem] flex-col gap-3 rounded-[18px] border border-border bg-white p-4 shadow-xs transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#d5dae2] hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function QuickActionCard({ item }: { item: QuickActionItem }) {
  const { label, href, icon: Icon, hint, badge, badgeLabel = "new", external } = item;
  const count = typeof badge === "number" && badge > 0 ? badge : null;
  const content = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text [&_svg]:size-5">
          <Icon />
        </span>
        {count !== null ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-2 text-xs font-semibold text-white tabular-nums">
            <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
            <span className="sr-only">
              , {count} {badgeLabel}
            </span>
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 pr-4">
        <span className="font-heading text-[15px] leading-snug font-bold text-pretty break-words text-foreground">{label}</span>
        {hint ? <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{hint}</span> : null}
      </span>
      {external ? (
        <>
          <ArrowUpRight aria-hidden="true" className="absolute right-3.5 bottom-3.5 size-4 text-muted-foreground/70" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      ) : (
        <ArrowRight
          aria-hidden="true"
          className="absolute right-3.5 bottom-3.5 size-4 text-muted-foreground/60 transition-[transform,color] duration-150 group-hover/qa:translate-x-0.5 group-hover/qa:text-foreground motion-reduce:transition-none"
        />
      )}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={CARD}>
      {content}
    </a>
  ) : (
    <Link href={href} className={CARD}>
      {content}
    </Link>
  );
}
