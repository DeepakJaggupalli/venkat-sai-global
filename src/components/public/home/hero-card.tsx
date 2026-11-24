import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { Flag } from "../flag";
import { EN_MARKETING, intlLocale, type MarketingT } from "../marketing-i18n";
import { RouteRotator } from "./route-rotator";

/**
 * The "product card" on the right of the homepage hero: the route from Visakhapatnam to a destination that changes
 * every ~2.2 s while a small plane flies the route (RouteRotator), what we help with, and a note that benefits depend
 * on the employer. The latest requirements are listed right below the hero, so this card does not repeat them.
 */

const CARD = "relative w-full rounded-3xl border border-border bg-white p-6 shadow-[0_1px_2px_rgb(10_10_11/0.04),0_24px_60px_-12px_rgb(10_10_11/0.12)] sm:p-7";

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
