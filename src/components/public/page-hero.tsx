import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

import { CmsImage } from "./cms-media";
import { Eyebrow } from "./section";
import { BeadPattern, HorizonOrnament } from "./visuals";

export type Crumb = { label: string; href?: string };

/** Visible breadcrumb trail (the last item is the current page). */
export function Breadcrumbs({ items, onDark = false, className }: { items: readonly Crumb[]; onDark?: boolean; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className={cn("flex flex-wrap items-center gap-1 text-sm", onDark ? "text-white/70" : "text-muted-foreground")}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className={cn("rounded-sm underline-offset-4 hover:underline", onDark ? "hover:text-white" : "hover:text-navy")}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && (onDark ? "text-white" : "text-navy"))}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Inner-page hero on deep navy: breadcrumbs, eyebrow, the page's only h1, intro, actions and an optional
 * visual. CMS hero images (public, consented) replace the designed ornament when supplied.
 */
export function PageHero({
  title,
  eyebrow,
  intro,
  breadcrumbs,
  actions,
  media,
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
  /** Custom decorative visual (shown when there is no CMS image). */
  visual?: ReactNode;
  /** Small facts row under the intro (e.g. "Last reviewed"). */
  meta?: ReactNode;
  className?: string;
}) {
  const image = media && media.kind === "image" ? media : null;
  return (
    <section className={cn("relative isolate overflow-hidden bg-navy-deep text-white", className)}>
      <BeadPattern />
      <div aria-hidden="true" className="absolute -top-40 right-[-10%] -z-10 size-[36rem] rounded-full bg-teal/15 blur-3xl" />
      <div className="container-page relative grid gap-10 py-14 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:py-20">
        <div className="min-w-0">
          {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} onDark className="mb-6" /> : null}
          {eyebrow ? <Eyebrow onDark>{eyebrow}</Eyebrow> : null}
          <h1 className="mt-3 text-balance font-heading text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          {intro ? <div className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-white/80">{intro}</div> : null}
          {meta ? <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">{meta}</div> : null}
          {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {image ? (
          <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/30">
            <CmsImage asset={image} priority className="aspect-[16/9] lg:aspect-[4/3]" sizes="(min-width: 1024px) 40vw, 100vw" />
          </div>
        ) : (
          <div className="relative hidden min-w-0 lg:block">{visual ?? <HorizonOrnament className="mx-auto w-full max-w-sm" />}</div>
        )}
      </div>
    </section>
  );
}
