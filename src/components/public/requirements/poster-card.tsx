import { ArrowRight, Globe2 } from "lucide-react";
import Link from "next/link";

import { absoluteUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

import { CmsImage } from "../cms-media";
import { WhatsAppIcon } from "../contact-links";
import { Flag } from "../flag";
import { EN_MARKETING, splitAround, type MarketingT } from "../marketing-i18n";
import { relativeTime, requirementApplyHref, requirementWhatsAppHref } from "./card-helpers";
import { POSTER_BUTTON_STYLES } from "./button-styles";
import type { PosterCard as PosterCardData } from "./data";

const APPLY = POSTER_BUTTON_STYLES.apply;
const WHATSAPP = POSTER_BUTTON_STYLES.whatsapp;

const DEFAULT_SIZES = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 480px) 50vw, 100vw";

/**
 * One requirement in a list. With a poster image: the poster (whole, never cropped) on a grey mat, then country,
 * title and trades. Without one: a clean text card. On phones (one column) the flag and country sit on a slim grey
 * band; from 480px, where the grid has several columns, that band becomes a 4:5 grey panel with a large flag, the
 * same height as a poster, so the cards in a row stay even and their buttons line up.
 * Both end with the posted time and two big buttons, "Apply" (the CV form with this requirement picked) and
 * "WhatsApp" (the office, with a prefilled message naming the job and its link). The title link stretches over the
 * card to the details page; the buttons sit above it. Copy follows the page language (`t`, English by default);
 * the poster's own text (as staff typed it) sits in <bdi> so it reads correctly on right-to-left pages.
 */
export function PosterCard({
  poster,
  headingLevel = "h3",
  priority = false,
  sizes = DEFAULT_SIZES,
  t = EN_MARKETING,
}: {
  poster: PosterCardData;
  headingLevel?: "h2" | "h3";
  priority?: boolean;
  /** `sizes` of the poster image (match the grid's columns). */
  sizes?: string;
  t?: MarketingT;
}) {
  const Heading = headingLevel;
  const trades = poster.trades.slice(0, 3);
  const moreTrades = poster.trades.length - trades.length;
  const image = poster.poster;
  const whatsapp = requirementWhatsAppHref({ title: poster.title, countryName: poster.countryName, url: absoluteUrl(poster.href) }, t);
  const [postedBefore, postedAfter] = splitAround(t("card.posted"), "time");
  return (
    <article
      className="card-surface lift group relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl has-[a[data-card-link]:focus-visible]:ring-2 has-[a[data-card-link]:focus-visible]:ring-ring"
      data-testid="poster-card"
      data-variant={image ? "poster" : "text"}
    >
      {image ? (
        <div className="relative aspect-[4/5] overflow-hidden border-b border-border bg-surface-subtle">
          <CmsImage
            asset={{ ...image, alt: poster.alt }}
            size="md"
            priority={priority}
            className="absolute inset-0 object-contain p-3 transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
            sizes={sizes}
          />
        </div>
      ) : (
        <div
          className="flex min-h-14 items-center gap-3 border-b border-border bg-surface-subtle px-5 py-3 min-[480px]:aspect-[4/5] min-[480px]:flex-col min-[480px]:justify-center min-[480px]:gap-4 min-[480px]:px-6 min-[480px]:text-center"
          data-testid="poster-text-panel"
        >
          <p className={cn("label-dot order-last min-[480px]:order-first min-[480px]:ms-0", poster.countryName && "ms-auto")}>{t("card.nowHiring")}</p>
          {poster.countryName ? (
            <p className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold text-foreground min-[480px]:flex-col min-[480px]:gap-3 min-[480px]:text-lg">
              <Flag code={poster.countryCode} className="h-5 w-[1.875rem] min-[480px]:h-12 min-[480px]:w-[4.5rem] min-[480px]:rounded-md" />
              <bdi className="truncate min-[480px]:whitespace-normal">{poster.countryName}</bdi>
            </p>
          ) : (
            <Globe2 aria-hidden="true" className="hidden size-10 text-muted-foreground/50 min-[480px]:block" />
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        {image && poster.countryName ? (
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Flag code={poster.countryCode} />
            <bdi>{poster.countryName}</bdi>
          </p>
        ) : null}
        <Heading className={cn("font-heading leading-snug font-bold tracking-tight break-words text-foreground", image ? "text-lg" : "text-xl min-[480px]:text-lg")}>
          <Link href={poster.href} data-card-link className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            <bdi>{poster.title}</bdi>
          </Link>
        </Heading>
        {trades.length ? (
          <ul className="mt-2 space-y-1 text-sm text-foreground" aria-label={t("card.trades")}>
            {trades.map((trade, i) => (
              <li key={`${trade.trade}-${i}`} className="flex flex-wrap gap-x-2">
                <bdi className="font-medium">{trade.trade}</bdi>
                {trade.pay ? <bdi className="text-muted-foreground tabular-nums">{trade.pay}</bdi> : null}
              </li>
            ))}
            {moreTrades > 0 ? <li className="text-muted-foreground">{t("card.moreTrades", { count: moreTrades })}</li> : null}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          {postedBefore}
          <time dateTime={poster.publishedAt.toISOString()}>{relativeTime(poster.publishedAt, t.locale)}</time>
          {postedAfter}
        </p>
        <div className="relative z-10 mt-auto flex flex-wrap gap-2 pt-4">
          <Link href={requirementApplyHref(poster.slug)} className={APPLY} aria-label={t("card.applyLabel", { title: poster.title })} data-testid="poster-apply">
            {t("card.apply")}
            <ArrowRight aria-hidden="true" className="transition-transform duration-150 group-hover/apply:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100" />
          </Link>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={WHATSAPP}
            aria-label={t("card.whatsappLabel", { title: poster.title })}
            data-testid="poster-whatsapp"
          >
            <WhatsAppIcon className="text-green-strong" />
            {t("card.whatsapp")}
          </a>
        </div>
      </div>
    </article>
  );
}

export function PosterGrid({
  posters,
  label,
  className,
  headingLevel = "h3",
  sizes,
  priorityCount = 2,
  t = EN_MARKETING,
}: {
  posters: PosterCardData[];
  label: string;
  className?: string;
  headingLevel?: "h2" | "h3";
  /** `sizes` of the poster images when the grid uses other columns than the default. */
  sizes?: string;
  /** How many posters load first (the ones above the fold); 0 when the grid starts below it. */
  priorityCount?: number;
  t?: MarketingT;
}) {
  return (
    <ul aria-label={label} className={cn("grid gap-6 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4", className)}>
      {posters.map((p, i) => (
        <li key={p.id} className="flex">
          <PosterCard poster={p} headingLevel={headingLevel} priority={i < priorityCount} sizes={sizes} t={t} />
        </li>
      ))}
    </ul>
  );
}
