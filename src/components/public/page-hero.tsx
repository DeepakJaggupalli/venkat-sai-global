import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { ImageCredit } from "@/content/image-credits";
import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

import { CmsImage } from "./cms-media";
import { Eyebrow } from "./section";
import { StockImage } from "./stock-image";

export type Crumb = { label: string; href?: string };

/** Visible breadcrumb trail (the last item is the current page). */
export function Breadcrumbs({ items, className }: { items: readonly Crumb[]; /** @deprecated no dark bands any more */ onDark?: boolean; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "text-foreground")}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 opacity-60" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Inner-page hero: white, breadcrumbs, an accent label, the page's only h1 in the big black display face, a grey
 * intro and pill actions. On the right: the business's own CMS image when there is one, else a credited stock
 * photograph (`photo`), else a custom `visual`; with none of them the hero is a single, centred-left column.
 */
export function PageHero({
  title,
  eyebrow,
  intro,
  breadcrumbs,
  actions,
  media,
  photo,
  visual,
  meta,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  intro?: ReactNode;
  breadcrumbs?: readonly Crumb[];
  actions?: ReactNode;
  media?: PublicMediaAsset | null;
  /** Stock photograph shown when the CMS has no image. */
  photo?: ImageCredit | null;
  /** Custom visual (shown when there is neither a CMS image nor a photo). */
  visual?: ReactNode;
  /** Small facts row under the intro (e.g. "Last reviewed"). */
  meta?: ReactNode;
  className?: string;
}) {
  const image = media && media.kind === "image" ? media : null;
  const side = image ? (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-surface-subtle shadow-card">
      <CmsImage asset={image} priority className="absolute inset-0" sizes="(min-width: 1024px) 40vw, 100vw" />
    </div>
  ) : photo ? (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-surface-subtle shadow-card">
      <StockImage photo={photo} priority sizes="(min-width: 1024px) 40vw, 100vw" />
    </div>
  ) : (
    (visual ?? null)
  );
  return (
    <section className={cn("relative bg-white", className)}>
      <div
        className={cn(
          "container-page grid gap-10 pt-10 pb-14 sm:pt-12 sm:pb-16 lg:items-center lg:pt-16 lg:pb-20",
          side ? "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16" : null,
        )}
      >
        <div className="min-w-0">
          {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} className="mb-8" /> : null}
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className={cn("mt-4 text-balance font-display text-[2.75rem] text-foreground sm:text-6xl", side ? "lg:text-[4rem]" : "max-w-4xl lg:text-[4.5rem]")}>{title}</h1>
          {intro ? <div className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">{intro}</div> : null}
          {meta ? <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">{meta}</div> : null}
          {actions ? <div className="mt-9 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {side ? <div className="relative min-w-0">{side}</div> : null}
      </div>
    </section>
  );
}
