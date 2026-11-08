import { ArrowRight, Flame, HardHat, Plane } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { AssetMap, PublishedEntry } from "@/modules/content/types";

import { CmsImage, pickAsset } from "../cms-media";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading } from "../section";

type FeaturedService = {
  key: "overseas" | "training" | "manpower";
  /** Matches a CMS service slug so its page link and photo are used when it exists. */
  match: RegExp;
  title: string;
  href: string;
  summary: string;
  points: readonly string[];
  icon: ReactNode;
  accent: string;
};

/** The three headline services. Links fall back to these paths when no matching CMS service is published. */
export const FEATURED_SERVICES: readonly FeaturedService[] = [
  {
    key: "overseas",
    match: /overseas|abroad|gulf/i,
    title: "Overseas employment",
    href: "/services/overseas-employment",
    summary: "Jobs with employers in the Gulf, Europe and Asia, with help from the first call to the flight.",
    points: ["Free for candidates to apply", "Interview and trade test support", "Visa, ticket and documents"],
    icon: <Plane aria-hidden="true" />,
    accent: "bg-royal text-white",
  },
  {
    key: "training",
    match: /training|course|skill/i,
    title: "Training",
    href: "/services/technical-training",
    summary: "Hands-on welding 3G, 4G, 5G and 6G, electrical, fitter and piping training at our Autonagar workshop.",
    points: ["Practical workshop sessions", "Venkat Sai trade assessments", "Preparation for overseas trade tests"],
    icon: <Flame aria-hidden="true" />,
    accent: "bg-red text-white",
  },
  {
    key: "manpower",
    match: /manpower|workforce|supply/i,
    title: "Manpower supply",
    href: "/services/bulk-manpower-supply",
    summary: "Skilled and semi-skilled tradespeople for projects, shutdowns and long-term contracts.",
    points: ["Trade-tested workers", "Single trades or full crews", "India and overseas projects"],
    icon: <HardHat aria-hidden="true" />,
    accent: "bg-yellow text-navy",
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

export function FeaturedServicesSection({
  services,
  assets,
  heading,
  intro,
}: {
  services: readonly PublishedEntry<"services">[];
  assets: AssetMap;
  heading?: string | null;
  intro?: string | null;
}) {
  const cards = matchFeaturedServices(services);
  return (
    <Section tone="white" labelledBy="home-services-title" data-testid="home-services">
      <div data-reveal>
        <SectionHeading
          id="home-services-title"
          eyebrow="What we do"
          title={<span className="uppercase">{heading || "Three ways we put skills to work"}</span>}
          intro={intro || "Find work abroad, learn a trade properly, or hire the people your project needs."}
          action={
            <CtaLink href="/services" cta="all_services" location="home_services" variant="outline" arrow>
              All services
            </CtaLink>
          }
        />
      </div>
      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {cards.map(({ service, entry }, i) => {
          const href = entry?.path ?? (entry ? `/services/${entry.slug}` : service.href);
          const image = entry ? pickAsset(assets, entry.heroAssetId) : null;
          return (
            <li key={service.key} data-reveal={String(i + 2)}>
              <article className="lift group relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
                <div className="relative h-40 overflow-hidden bg-navy">
                  {image && image.kind === "image" ? (
                    <CmsImage asset={image} size="md" sizes="(min-width: 768px) 33vw, 100vw" className="transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <ServiceArt index={i} />
                  )}
                  <span aria-hidden="true" className={`absolute bottom-4 left-5 flex size-14 items-center justify-center rounded-xl shadow-lg [&_svg]:size-7 ${service.accent}`}>
                    {service.icon}
                  </span>
                  <span aria-hidden="true" className="absolute top-3 right-4 font-display text-5xl text-white/25">
                    0{i + 1}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-3xl uppercase text-navy">
                    <Link href={href} className="rounded-sm after:absolute after:inset-0 after:content-['']">
                      {service.title}
                    </Link>
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{service.summary}</p>
                  <ul className="mt-5 space-y-2 text-sm font-medium text-navy">
                    {service.points.map((p) => (
                      <li key={p} className="flex items-center gap-2">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-red" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-bold uppercase tracking-wide text-teal-strong">
                    Learn more <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
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

/** Decorative card header art (route lines, weld sparks, scaffold grid) until real photos are uploaded. */
function ServiceArt({ index }: { index: number }) {
  return (
    <svg viewBox="0 0 400 160" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice" className="size-full">
      <rect width="400" height="160" fill="#0b1f5c" />
      {index === 0 ? (
        <g fill="none" strokeLinecap="round">
          <path d="M40 130 Q160 10 360 60" stroke="#ffd000" strokeWidth="2" strokeDasharray="4 8" />
          <path d="M40 130 Q200 40 330 120" stroke="#8fb0ff" strokeWidth="1.5" strokeDasharray="2 6" />
          <circle cx="40" cy="130" r="6" fill="#e3262e" />
          <circle cx="360" cy="60" r="4" fill="#ffd000" />
          <circle cx="330" cy="120" r="4" fill="#ffd000" />
          <circle cx="250" cy="80" r="70" stroke="#ffffff" strokeOpacity="0.08" />
          <circle cx="250" cy="80" r="110" stroke="#ffffff" strokeOpacity="0.05" />
        </g>
      ) : index === 1 ? (
        <g>
          <path d="M0 120 H400" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="10" />
          <path d="M120 120 C150 112 170 112 200 120" stroke="#ffd000" strokeWidth="6" fill="none" />
          {[...Array(14)].map((_, i) => {
            const a = (i / 14) * Math.PI - Math.PI;
            const len = 30 + ((i * 37) % 40);
            return <path key={i} d={`M200 116 L${200 + Math.cos(a) * len} ${116 + Math.sin(a) * len}`} stroke={i % 3 ? "#ffd000" : "#e3262e"} strokeWidth="2" strokeLinecap="round" />;
          })}
          <circle cx="200" cy="116" r="8" fill="#ffffff" />
        </g>
      ) : (
        <g stroke="#ffffff" strokeOpacity="0.18" strokeWidth="3">
          {[60, 140, 220, 300].map((x) => (
            <path key={x} d={`M${x} 10 V160`} />
          ))}
          {[40, 90, 140].map((y) => (
            <path key={y} d={`M30 ${y} H340`} />
          ))}
          <path d="M60 140 L140 90 M140 140 L220 90 M220 140 L300 90" stroke="#ffd000" strokeOpacity="0.7" />
        </g>
      )}
    </svg>
  );
}
