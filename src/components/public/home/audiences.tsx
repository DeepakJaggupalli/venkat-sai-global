import { IMAGE_CREDITS } from "@/content/image-credits";

import { CheckList } from "../blocks";
import { CtaLink } from "../cta-link";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { Section, SectionHeading } from "../section";
import { StockImage } from "../stock-image";

/**
 * "For employers / candidates / partners / institutions" homepage sections. The copy describes what the
 * platform does today (features, not results) — no figures, client names or promises.
 * The homepage shows the partner and institution cards; their copy is in public-marketing (audiences.<key>.*).
 */

export type AudienceKey = "employers" | "candidates" | "partners" | "institutions";
export type AudienceCardKey = Extract<AudienceKey, "partners" | "institutions">;

const AUDIENCE_LINKS: Record<AudienceCardKey, { href: string; cta: string }> = {
  partners: { href: "/partners", cta: "become_recruitment_partner" },
  institutions: { href: "/institutions", cta: "institutions_landing" },
};

const AUDIENCE_PHOTO: Record<AudienceKey, string> = {
  employers: "/images/stock/crew-2.webp",
  candidates: "/images/stock/welding-3.webp",
  partners: "/images/stock/crew-3.webp",
  institutions: "/images/stock/training-2.webp",
};

/**
 * The audience sections the CMS homepage switches on (partners, institutions), shown together as one calm row
 * of photo cards instead of one big section each. Copy describes features, never results.
 */
export function AudienceCards({
  audiences,
  heading,
  intro,
  tone = "white",
  t = EN_MARKETING,
}: {
  audiences: readonly AudienceCardKey[];
  heading?: string | null;
  intro?: string | null;
  tone?: "white" | "subtle";
  t?: MarketingT;
}) {
  if (!audiences.length) return null;
  return (
    <Section tone={tone} labelledBy="home-audiences-title" data-testid="home-audiences">
      <SectionHeading id="home-audiences-title" eyebrow={t("audiences.eyebrow")} title={heading || t("audiences.title")} intro={intro || t("audiences.intro")} />
      <ul className={audiences.length > 1 ? "mt-12 grid gap-6 md:grid-cols-2" : "mt-12 grid max-w-2xl gap-6"}>
        {audiences.map((audience) => {
          const link = AUDIENCE_LINKS[audience];
          const photo = IMAGE_CREDITS.find((c) => c.src === AUDIENCE_PHOTO[audience]);
          const k = `audiences.${audience}`;
          return (
            <li key={audience} data-testid={`home-${audience}`}>
              <article className="card-surface flex h-full flex-col overflow-hidden rounded-3xl">
                {photo ? (
                  <div className="relative aspect-[16/9] bg-surface-subtle">
                    <StockImage photo={photo} decorative sizes="(min-width: 768px) 50vw, 100vw" />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <p className="label-dot">{t(`${k}.eyebrow`)}</p>
                  <h3 className="mt-3 font-display text-2xl text-foreground sm:text-[1.75rem]">{t(`${k}.title`)}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t(`${k}.intro`)}</p>
                  <CheckList items={[t(`${k}.point1`), t(`${k}.point2`), t(`${k}.point3`)]} className="mt-6 text-[15px]" />
                  <div className="mt-auto pt-8">
                    <CtaLink href={link.href} cta={link.cta} location={`home_${audience}`} variant="outline" arrow>
                      {t(`${k}.cta`)}
                    </CtaLink>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
