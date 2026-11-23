import { ArrowRight, Check, Plane } from "lucide-react";
import Link from "next/link";

import type { PublicLocale } from "@/i18n/config";
import { formatRelative } from "@/lib/format";

import { CmsImage } from "../cms-media";
import { Flag } from "../flag";
import { EN_MARKETING, intlLocale, splitAround, type MarketingT } from "../marketing-i18n";
import type { PosterCard } from "../requirements/data";
import { RouteRotator } from "./route-rotator";

/**
 * The "product card" on the right of the homepage hero: the latest published requirement poster as a clean,
 * structured card (flag, destination, trades with pay, an Apply pill), or a static route card when nothing is
 * published. Server components; the poster image is a small thumbnail so the card stays calm.
 * Poster content (trades, pay, benefits) is shown as published.
 */

const CARD = "relative w-full rounded-3xl border border-border bg-white p-6 shadow-[0_1px_2px_rgb(10_10_11/0.04),0_24px_60px_-12px_rgb(10_10_11/0.12)] sm:p-7";

/** "3 days ago" in the page language (English keeps the existing wording). */
function relativeTime(date: Date, locale: PublicLocale): string {
  if (locale === "en") return formatRelative(date);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
}

export function NowHiringCard({ poster, t = EN_MARKETING }: { poster: PosterCard; t?: MarketingT }) {
  const trades = poster.trades.slice(0, 3);
  const lead = trades[0];
  const applyHref = `/send-cv?requirement=${encodeURIComponent(poster.slug)}`;
  const [postedBefore, postedAfter] = splitAround(t("card.posted"), "time");
  return (
    <article className={CARD} aria-labelledby="hero-card-title" data-testid="hero-now-hiring">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 rounded-full bg-teal-soft px-3 py-1 text-xs font-semibold text-teal-strong">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-teal" />
          {t("card.nowHiring")}
        </p>
        <p className="text-xs text-muted-foreground">
          {postedBefore}
          <time dateTime={poster.publishedAt.toISOString()}>{relativeTime(poster.publishedAt, t.locale)}</time>
          {postedAfter}
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
            <ul aria-label={t("card.trades")} className="space-y-2 text-sm">
              {trades.slice(1).map((trade, i) => (
                <li key={`${trade.trade}-${i}`} className="flex flex-wrap justify-between gap-x-4">
                  <span className="font-medium text-foreground">{trade.trade}</span>
                  {trade.pay ? <span className="text-muted-foreground tabular-nums">{trade.pay}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {poster.benefits.length ? (
            <ul aria-label={t("card.benefits")} className="flex flex-wrap gap-1.5">
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
          {t("card.apply")}
          <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover/apply:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
        <Link href={poster.href} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
          {t("card.details")}
        </Link>
        <span className="ms-auto text-xs text-muted-foreground">{t("card.free")}</span>
      </div>
    </article>
  );
}

const ROUTE_ITEMS = ["route.visa", "route.food", "route.medical", "route.documents", "route.transport", "route.ticket"] as const;

/** Destinations the route card rotates through (copy: route.dest.<id>.city / .country). The origin stays Vizag. */
export const ROUTE_DESTINATIONS = [
  { id: "dubai", code: "AE" },
  { id: "riyadh", code: "SA" },
  { id: "manama", code: "BH" },
  { id: "singapore", code: "SG" },
  { id: "kualaLumpur", code: "MY" },
  { id: "warsaw", code: "PL" },
  { id: "doha", code: "QA" },
  { id: "muscat", code: "OM" },
] as const;

/**
 * Card used when no requirement poster is published: the route from Visakhapatnam to a destination that changes
 * every few seconds (RouteRotator), what we help with, and a note that benefits depend on the employer.
 */
export function RouteCard({ t = EN_MARKETING }: { t?: MarketingT }) {
  const destinations = ROUTE_DESTINATIONS.map((d) => ({
    id: d.id,
    city: t(`route.dest.${d.id}.city`),
    country: t(`route.dest.${d.id}.country`),
    flag: <Flag code={d.code} />,
  }));
  const cities = new Intl.ListFormat(intlLocale(t.locale), { type: "conjunction" }).format(destinations.map((d) => d.city));
  return (
    <RouteRotator
      className={CARD}
      destinations={destinations}
      srText={`${t("route.destinationsLabel")}: ${cities}`}
      header={
        <>
          <p className="label-dot">{t("route.eyebrow")}</p>
          <h2 id="hero-card-title" className="sr-only">
            {t("route.title")}
          </h2>
        </>
      }
      origin={
        <div>
          <p className="flex items-center gap-2 font-display text-xl text-foreground">
            <Flag code="IN" />
            {t("route.from")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("route.fromDetail")}</p>
        </div>
      }
      connector={
        <div aria-hidden="true" className="relative flex items-center">
          <span className="h-px w-full border-t border-dashed border-[#c9cdd5]" />
          <span className="absolute left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-white text-teal-strong">
            <Plane className="size-4" />
          </span>
        </div>
      }
      footer={
        <>
          <ul aria-label={t("route.helpLabel")} className="mt-8 flex flex-wrap gap-2">
            {ROUTE_ITEMS.map((key) => (
              <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground">
                <Check aria-hidden="true" className="size-3.5 text-teal-strong" strokeWidth={3} />
                {t(key)}
              </li>
            ))}
            <li className="inline-flex items-center rounded-full px-1.5 py-1.5 text-sm font-medium text-muted-foreground">{t("route.more")}</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t("route.benefitsNote")}</p>
          <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">{t("route.noFee")}</p>
            <Link href="/requirements" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
              {t("route.requirements")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </>
      }
    />
  );
}
