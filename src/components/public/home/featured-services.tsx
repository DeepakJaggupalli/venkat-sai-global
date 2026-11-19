import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { stockPhoto, type StockKey } from "@/content/stock-photos";
import type { AssetMap, PublishedEntry } from "@/modules/content/types";

import { CmsImage, pickAsset } from "../cms-media";
import { CtaLink } from "../cta-link";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { Section, SectionHeading, type SectionTone } from "../section";
import { StockImage } from "../stock-image";

type FeaturedService = {
  key: "overseas" | "training" | "manpower";
  /** Matches a CMS service slug so its page link and photo are used when it exists. */
  match: RegExp;
  href: string;
  photo: StockKey;
};

/** The three headline services (copy: services.<key>.* in public-marketing). Links fall back to these paths when no matching CMS service is published. */
export const FEATURED_SERVICES: readonly FeaturedService[] = [
  {
    key: "overseas",
    match: /overseas|abroad|gulf/i,
    href: "/services/overseas-employment",
    photo: "overseas",
  },
  {
    key: "training",
    match: /training|course|skill/i,
    href: "/services/technical-training",
    photo: "training",
  },
  {
    key: "manpower",
    match: /manpower|workforce|supply/i,
    href: "/services/bulk-manpower-supply",
    photo: "manpower",
  },
];

/** Picks the CMS service for each featured card by slug (first match wins, each entry used once). */
export function matchFeaturedServices(entries: readonly Pick<PublishedEntry<"services">, "slug" | "path" | "heroAssetId">[]) {
  const used = new Set<string>();
  return FEATURED_SERVICES.map((service) => {
    const entry = entries.find((e) => !used.has(e.slug) && service.match.test(e.slug));
    if (entry) used.add(entry.slug);
    return { service, entry: entry ?? null };
  });
}

/** "What we do": three large photo cards (image on top, text below) and a link to every service. */
export function FeaturedServicesSection({
  tone = "white",
  services,
  assets,
  heading,
  intro,
  t = EN_MARKETING,
}: {
  services: readonly PublishedEntry<"services">[];
  assets: AssetMap;
  heading?: string | null;
  intro?: string | null;
  t?: MarketingT;
} & { tone?: SectionTone }) {
  const cards = matchFeaturedServices(services);
  return (
    <Section tone={tone} labelledBy="home-services-title" data-testid="home-services">
      <div data-reveal>
        <SectionHeading
          id="home-services-title"
          eyebrow={t("services.eyebrow")}
          title={heading || t("services.title")}
          intro={intro || t("services.intro")}
          action={
            <CtaLink href="/services" cta="all_services" location="home_services" variant="outline" arrow>
              {t("services.all")}
            </CtaLink>
          }
        />
      </div>
      <ul className="mt-14 grid gap-6 md:grid-cols-3">
        {cards.map(({ service, entry }, i) => {
          const href = entry?.path ?? (entry ? `/services/${entry.slug}` : service.href);
          const image = entry ? pickAsset(assets, entry.heroAssetId) : null;
          return (
            <li key={service.key} data-reveal={String(i + 2)}>
              <article className="card-surface lift group relative flex h-full flex-col overflow-hidden rounded-3xl">
                <div className="relative aspect-[16/10] overflow-hidden bg-surface-subtle">
                  {image && image.kind === "image" ? (
                    <CmsImage asset={image} size="md" sizes="(min-width: 768px) 33vw, 100vw" className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
                  ) : (
                    <StockImage
                      photo={stockPhoto(service.photo)}
                      decorative
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <h3 className="font-display text-2xl text-foreground sm:text-[1.75rem]">
                    <Link href={href} className="rounded-sm after:absolute after:inset-0 after:content-['']">
                      {t(`services.${service.key}.title`)}
                    </Link>
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t(`services.${service.key}.summary`)}</p>
                  <ul className="mt-5 space-y-2.5 text-sm text-foreground">
                    {(["point1", "point2", "point3"] as const).map((p) => (
                      <li key={p} className="flex items-center gap-2.5">
                        <Check aria-hidden="true" className="size-4 shrink-0 text-teal-strong" strokeWidth={2.5} />
                        {t(`services.${service.key}.${p}`)}
                      </li>
                    ))}
                  </ul>
                  <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-semibold text-foreground">
                    {t("common.learnMore")} <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" />
                  </span>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
