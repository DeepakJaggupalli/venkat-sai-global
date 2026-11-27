import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { absoluteUrl } from "@/lib/env";

import { CmsImage } from "../cms-media";
import { Flag } from "../flag";
import { EN_MARKETING, intlLocale, type MarketingT } from "../marketing-i18n";
import { requirementApplyHref, requirementWhatsAppHref } from "../requirements/card-helpers";
import type { PosterCard } from "../requirements/data";
import { HeroPosterSlider, type HeroPosterSlide } from "./hero-posters";
import { RouteRotator } from "./route-rotator";

/**
 * The "product card" on the right of the homepage hero: the route from Visakhapatnam to a destination that changes
 * every ~2.2 s while a small plane flies the route (RouteRotator), what we help with, and a note that benefits depend
 * on the employer. The latest requirements are listed right below the hero, so this card does not repeat them.
 */

export const HERO_CARD = "relative w-full rounded-3xl border border-border bg-white p-6 shadow-[0_1px_2px_rgb(10_10_11/0.04),0_24px_60px_-12px_rgb(10_10_11/0.12)] sm:p-7";

const ROUTE_ITEMS = ["route.visa", "route.food", "route.medical", "route.documents", "route.transport", "route.ticket"] as const;

/**
 * Destinations the route card flies to, in order (copy: route.dest.<id>.city / .country in every marketing language;
 * flags from public/flags). The origin stays Vizag.
 */
export const ROUTE_DESTINATIONS = [
  { id: "dubai", code: "AE" },
  { id: "riyadh", code: "SA" },
  { id: "singapore", code: "SG" },
  { id: "doha", code: "QA" },
  { id: "warsaw", code: "PL" },
  { id: "kuwait", code: "KW" },
  { id: "kualaLumpur", code: "MY" },
  { id: "muscat", code: "OM" },
  { id: "moscow", code: "RU" },
  { id: "manama", code: "BH" },
] as const;

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
      className={HERO_CARD}
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
        <>
          <p className="flex items-center gap-2 font-display text-xl text-foreground">
            <Flag code="IN" />
            {t("route.from")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("route.fromDetail")}</p>
        </>
      }
      footer={
        <>
          <ul aria-label={t("route.helpLabel")} className="mt-7 flex flex-wrap gap-2 sm:mt-8">
            {ROUTE_ITEMS.map((key) => (
              <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground">
                <Check aria-hidden="true" className="size-3.5 text-teal-strong" strokeWidth={3} />
                {t(key)}
              </li>
            ))}
            <li className="inline-flex items-center rounded-full px-1.5 py-1.5 text-sm font-medium text-muted-foreground">{t("route.more")}</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t("route.benefitsNote")}</p>
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5 sm:mt-8">
            <p className="text-sm text-muted-foreground">{t("route.noFee")}</p>
            <Link href="/requirements" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
              {t("route.requirements")}
              <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </Link>
          </div>
        </>
      }
    />
  );
}

/** Most posters the hero slideshow cycles through (the newest first). */
export const HERO_POSTER_LIMIT = 8;

/**
 * The hero card: a slideshow of the latest requirement posters that have a poster image (uploaded by staff, e.g. from
 * the phone gallery), else the route card. Posters without an image stay in the requirements list below the hero.
 */
export function HeroCard({ posters = [], t = EN_MARKETING }: { posters?: readonly PosterCard[]; t?: MarketingT }) {
  const slides: HeroPosterSlide[] = posters
    .filter((p) => p.poster)
    .slice(0, HERO_POSTER_LIMIT)
    .map((p, i) => ({
      id: p.id,
      href: p.href,
      applyHref: requirementApplyHref(p.slug),
      whatsappHref: requirementWhatsAppHref({ title: p.title, countryName: p.countryName, url: absoluteUrl(p.href) }, t),
      title: p.title,
      countryName: p.countryName,
      flag: <Flag code={p.countryCode} />,
      image: <CmsImage asset={{ ...p.poster!, alt: p.alt }} size="md" priority={i === 0} className="absolute inset-0 object-contain p-3" sizes="(min-width: 1024px) 40vw, 100vw" />,
      trades:
        p.trades
          .slice(0, 2)
          .map((tr) => (tr.pay ? `${tr.trade} (${tr.pay})` : tr.trade))
          .join(" · ") || null,
      applyLabel: t("card.applyLabel", { title: p.title }),
      whatsappLabel: t("card.whatsappLabel", { title: p.title }),
    }));
  if (!slides.length) return <RouteCard t={t} />;
  return (
    <HeroPosterSlider
      className={HERO_CARD}
      slides={slides}
      labels={{
        eyebrow: t("reqs.title"),
        nowHiring: t("card.nowHiring"),
        apply: t("card.apply"),
        whatsapp: t("card.whatsapp"),
        all: t("reqs.all"),
        noFee: t("route.noFee"),
        prev: t("heroPosters.prev"),
        next: t("heroPosters.next"),
        pause: t("landing.walk.pause"),
        play: t("landing.walk.play"),
        goTo: t("heroPosters.goTo"),
        slide: t("heroPosters.slide"),
      }}
    />
  );
}
