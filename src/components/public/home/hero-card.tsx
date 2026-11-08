import { ArrowRight, Check, Plane } from "lucide-react";
import Link from "next/link";

import { formatRelative } from "@/lib/format";

import { CmsImage } from "../cms-media";
import { Flag } from "../flag";
import type { PosterCard } from "../requirements/data";

/**
 * The "product card" on the right of the homepage hero: the latest published requirement poster as a clean,
 * structured card (flag, destination, trades with pay, an Apply pill), or a static route card when nothing is
 * published. Server components; the poster image is a small thumbnail so the card stays calm.
 */

const CARD = "relative w-full rounded-3xl border border-border bg-white p-6 shadow-[0_1px_2px_rgb(10_10_11/0.04),0_24px_60px_-12px_rgb(10_10_11/0.12)] sm:p-7";

export function NowHiringCard({ poster }: { poster: PosterCard }) {
  const trades = poster.trades.slice(0, 3);
  const lead = trades[0];
  const applyHref = `/send-cv?requirement=${encodeURIComponent(poster.slug)}`;
  return (
    <article className={CARD} aria-labelledby="hero-card-title" data-testid="hero-now-hiring">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 rounded-full bg-teal-soft px-3 py-1 text-xs font-semibold text-teal-strong">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-teal" />
          Now hiring
        </p>
        <p className="text-xs text-muted-foreground">
          Posted <time dateTime={poster.publishedAt.toISOString()}>{formatRelative(poster.publishedAt)}</time>
        </p>
      </div>

      <div className="mt-6 flex gap-5">
        {poster.poster ? (
          <Link href={poster.href} className="relative block w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-subtle sm:w-28" tabIndex={-1} aria-hidden="true">
            <div className="aspect-[4/5]">
              <CmsImage asset={{ ...poster.poster, alt: "" }} size="thumb" sizes="112px" className="absolute inset-0" />
            </div>
          </Link>
        ) : null}
        <div className="min-w-0">
          {poster.countryName ? (
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Flag code={poster.countryCode} />
              {poster.countryName}
            </p>
          ) : null}
          <h2 id="hero-card-title" className="mt-2 font-display text-2xl text-foreground sm:text-[1.75rem]">
            {lead?.trade ?? poster.title}
          </h2>
          {lead?.pay ? <p className="mt-1.5 text-[15px] font-medium text-foreground tabular-nums">{lead.pay}</p> : null}
          {poster.companyName ? <p className="mt-1 truncate text-sm text-muted-foreground">{poster.companyName}</p> : null}
        </div>
      </div>

      {trades.length > 1 || poster.benefits.length ? (
        <div className="mt-6 space-y-3 border-t border-border pt-5">
          {trades.length > 1 ? (
            <ul aria-label="Trades" className="space-y-2 text-sm">
              {trades.slice(1).map((t, i) => (
                <li key={`${t.trade}-${i}`} className="flex flex-wrap justify-between gap-x-4">
                  <span className="font-medium text-foreground">{t.trade}</span>
                  {t.pay ? <span className="text-muted-foreground tabular-nums">{t.pay}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {poster.benefits.length ? (
            <ul aria-label="Benefits" className="flex flex-wrap gap-1.5">
              {poster.benefits.slice(0, 4).map((b) => (
                <li key={b} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                  <Check aria-hidden="true" className="size-3 text-teal-strong" strokeWidth={3} />
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Link
          href={applyHref}
          className="group/apply inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-white transition-colors hover:bg-[#26262b] focus-visible:outline-2 focus-visible:outline-offset-2"
          data-testid="hero-card-apply"
        >
          Apply now
          <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover/apply:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
        <Link href={poster.href} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
          View details
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">Free to apply</span>
      </div>
    </article>
  );
}

/** Static card used when no requirement poster is published: the route from Visakhapatnam and what we handle. */
export function RouteCard() {
  return (
    <article className={CARD} aria-labelledby="hero-card-title" data-testid="hero-route-card">
      <p className="label-dot">Your route abroad</p>
      <h2 id="hero-card-title" className="sr-only">
        From Visakhapatnam to your job abroad
      </h2>
      <div className="mt-8 grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <div>
          <p className="flex items-center gap-2 font-display text-xl text-foreground">
            <Flag code="IN" />
            Vizag
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Visakhapatnam, India</p>
        </div>
        <div aria-hidden="true" className="relative flex items-center">
          <span className="h-px w-full border-t border-dashed border-[#c9cdd5]" />
          <span className="absolute left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-white text-teal-strong">
            <Plane className="size-4" />
          </span>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-2 font-display text-xl text-foreground">
            Dubai
            <Flag code="AE" />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">United Arab Emirates</p>
        </div>
      </div>
      <ul aria-label="What we help with" className="mt-8 flex flex-wrap gap-2">
        {["Visa", "Medical", "Documents", "Ticket"].map((item) => (
          <li key={item} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground">
            <Check aria-hidden="true" className="size-3.5 text-teal-strong" strokeWidth={3} />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-5">
        <p className="text-sm text-muted-foreground">You never pay a placement fee.</p>
        <Link href="/requirements" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
          Requirements
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}
