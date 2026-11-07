import Link from "next/link";
import { Children, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

import { CmsImage, ImagePlaceholder } from "./cms-image";

/**
 * Listing card for CMS entries (news, blog, events, stories, albums, videos). The title link stretches
 * over the card, so the whole card is clickable while keeping a single, well-named link per card.
 */
export function EntryCard({
  href,
  title,
  summary,
  eyebrow,
  meta,
  image,
  placeholderIcon,
  badge,
  headingLevel = "h2",
  className,
  imageAspect = "aspect-[16/9]",
  overlay,
}: {
  href: string;
  title: string;
  summary?: string | null;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  image?: PublicMediaAsset | null;
  placeholderIcon: ReactNode;
  badge?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
  imageAspect?: string;
  /** Rendered over the image (e.g. a play icon). Decorative. */
  overlay?: ReactNode;
}) {
  const Heading = headingLevel;
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs transition-shadow duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      )}
    >
      <div className="relative">
        {image ? (
          <CmsImage asset={image} variant="md" alt="" aspect={imageAspect} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" imgClassName="transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
        ) : (
          <ImagePlaceholder icon={placeholderIcon} aspect={imageAspect} />
        )}
        {overlay ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">{overlay}</div> : null}
        {badge ? <div className="absolute top-3 left-3">{badge}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {eyebrow ? <div className="text-xs font-semibold text-teal-strong">{eyebrow}</div> : null}
        <Heading className="font-heading text-lg leading-snug font-semibold text-navy">
          <Link href={href} className="rounded-sm after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4 focus-visible:outline-none">
            {title}
          </Link>
        </Heading>
        {summary ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{summary}</p> : null}
        {meta ? <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
    </article>
  );
}

/** Responsive list of cards (1 / 2 / 3 columns); each child becomes a list item. */
export function EntryGrid({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Children.toArray(children).map((child, i) => (
        <li key={i} className="flex [&>*]:w-full">
          {child}
        </li>
      ))}
    </ul>
  );
}
