import { Building2, GraduationCap, Handshake, HardHat, Plane, type LucideIcon } from "lucide-react";

import { IMAGE_CREDITS, type ImageCredit } from "@/content/image-credits";
import { stockPhoto } from "@/content/stock-photos";

import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { PathFinder, type FinderPath } from "../playful/path-finder";
import { Section, SectionHeading, type SectionTone } from "../section";
import { StockImage } from "../stock-image";

function photoBySrc(name: string): ImageCredit {
  return IMAGE_CREDITS.find((c) => c.src === `/images/stock/${name}.webp`) ?? stockPhoto("workshop");
}

/** One entry per kind of visitor: where "start" goes, the audience page with the full guide, an icon and a photo. */
const PATHS: { key: "people" | "company" | "agency" | "partner" | "institution"; start: string; guide: string; icon: LucideIcon; photo: string }[] = [
  { key: "people", start: "/send-cv", guide: "/candidates", icon: HardHat, photo: "welding-1" },
  { key: "company", start: "/employers/request", guide: "/employers", icon: Building2, photo: "crew-1" },
  { key: "agency", start: "/sign-up?intent=travel_agency", guide: "/agencies", icon: Plane, photo: "travel-2" },
  { key: "partner", start: "/sign-up?intent=partner", guide: "/partners", icon: Handshake, photo: "crew-3" },
  { key: "institution", start: "/sign-up?intent=institution", guide: "/institutions", icon: GraduationCap, photo: "training-1" },
];

/** Homepage "Who are you?" band: pick a kind of visitor to see what they get, their first three steps and where to start. */
export function PathFinderSection({ tone = "white", t = EN_MARKETING }: { tone?: SectionTone; t?: MarketingT }) {
  const paths: FinderPath[] = PATHS.map((p) => {
    const Icon = p.icon;
    return {
      key: p.key,
      label: t(`path.${p.key}.label`),
      tagline: t(`path.${p.key}.tagline`),
      steps: [t(`path.${p.key}.step1`), t(`path.${p.key}.step2`), t(`path.${p.key}.step3`)],
      cta: { label: t(`path.${p.key}.cta`), href: p.start, id: `path_${p.key}_start` },
      guide: { label: t("path.guide"), href: p.guide },
      icon: <Icon />,
      photo: <StockImage photo={photoBySrc(p.photo)} sizes="(min-width: 1024px) 30vw, 1px" />,
    };
  });
  return (
    <Section tone={tone} labelledBy="home-path-title" data-testid="home-path-finder">
      <SectionHeading id="home-path-title" eyebrow={t("path.eyebrow")} title={t("path.title")} intro={t("path.intro")} />
      <div className="mt-10">
        <PathFinder paths={paths} labels={{ hint: t("path.hint"), steps: t("path.steps") }} location="home_path_finder" />
      </div>
    </Section>
  );
}
