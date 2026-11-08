import { ArrowRight, ImageIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { CmsImage } from "../cms-media";
import { Flag } from "../flag";
import type { PosterCard as PosterCardData } from "./data";

/** One requirement poster in a grid: the poster (whole, never cropped) on a grey mat, then country, title and trades. */
export function PosterCard({ poster, headingLevel = "h3", priority = false }: { poster: PosterCardData; headingLevel?: "h2" | "h3"; priority?: boolean }) {
  const Heading = headingLevel;
  const trades = poster.trades.slice(0, 3);
  return (
    <article className="card-surface lift group relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl focus-within:ring-2 focus-within:ring-ring" data-testid="poster-card">
      <div className="relative aspect-[4/5] overflow-hidden border-b border-border bg-surface-subtle">
        {poster.poster ? (
          <CmsImage
            asset={{ ...poster.poster, alt: poster.alt }}
            size="md"
            priority={priority}
            className="absolute inset-0 object-contain p-3 transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 480px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-10" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {poster.countryName ? (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Flag code={poster.countryCode} />
            {poster.countryName}
          </p>
        ) : null}
        <Heading className="font-heading text-lg leading-snug font-bold tracking-tight text-foreground">
          <Link href={poster.href} className="after:absolute after:inset-0 focus-visible:outline-none">
            {poster.title}
          </Link>
        </Heading>
        {trades.length ? (
          <ul className="space-y-1 text-sm text-foreground" aria-label="Trades">
            {trades.map((t, i) => (
              <li key={`${t.trade}-${i}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{t.trade}</span>
                {t.pay ? <span className="text-muted-foreground tabular-nums">{t.pay}</span> : null}
              </li>
            ))}
            {poster.trades.length > trades.length ? <li className="text-muted-foreground">and {poster.trades.length - trades.length} more</li> : null}
          </ul>
        ) : null}
        <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1.5 pt-3 text-sm font-semibold text-foreground">
          View details <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </div>
    </article>
  );
}

export function PosterGrid({ posters, label, className, headingLevel = "h3" }: { posters: PosterCardData[]; label: string; className?: string; headingLevel?: "h2" | "h3" }) {
  return (
    <ul aria-label={label} className={cn("grid gap-6 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4", className)}>
      {posters.map((p, i) => (
        <li key={p.id} className="flex">
          <PosterCard poster={p} headingLevel={headingLevel} priority={i < 2} />
        </li>
      ))}
    </ul>
  );
}
