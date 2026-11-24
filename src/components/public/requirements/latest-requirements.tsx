import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { CtaLink } from "../cta-link";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { JobAlerts } from "../push/job-alerts";
import { SectionHeading } from "../section";
import { pickPosters } from "./card-helpers";
import { loadPosterPage, type PosterCard } from "./data";
import { PosterGrid } from "./poster-card";

type SectionProps = {
  heading?: string;
  /** `null` hides the intro; left out, the default intro shows. */
  intro?: string | null;
  className?: string;
  tone?: "white" | "subtle";
  /** Anchor of the section (the homepage hero's "Apply for open jobs" jumps to `#requirements`). */
  id?: string;
  /** Small "Refer a friend" link under the list. */
  showRefer?: boolean;
  /** Extra classes for the card grid (e.g. three columns at most). */
  gridClassName?: string;
  /** `sizes` of the poster images, to match `gridClassName`. */
  sizes?: string;
  /** How many posters load first (0 when the section starts below the fold). */
  priorityCount?: number;
  t?: MarketingT;
};

/**
 * The latest published requirements (newest first), with and without a poster image, each with Apply and WhatsApp
 * buttons; then "See all requirements", the optional "Refer a friend" link and the job-alerts button.
 * Renders nothing when no requirement is published.
 */
export function RequirementsSection({
  posters,
  heading,
  intro,
  className,
  tone = "white",
  id = "requirements",
  showRefer = false,
  gridClassName,
  sizes,
  priorityCount,
  t = EN_MARKETING,
}: SectionProps & { posters: PosterCard[] }) {
  if (!posters.length) return null;
  const headingId = `${id}-heading`;
  const title = heading?.trim() || t("reqs.title");
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-16 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24 xl:scroll-mt-[4.5rem]", tone === "subtle" ? "bg-surface-subtle" : "bg-white", className)}
      data-testid="latest-requirements"
    >
      <div className="container-page">
        <SectionHeading id={headingId} eyebrow={t("card.nowHiring")} title={title} intro={intro === undefined ? t("reqs.intro") : intro} />
        <PosterGrid posters={posters} label={title} className={cn("mt-8 sm:mt-12", gridClassName)} sizes={sizes} priorityCount={priorityCount} t={t} />
        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <CtaLink href="/requirements" cta="all_requirements" location="latest_requirements" variant="outline" arrow className="min-h-12 px-6 text-[15px]">
            {t("reqs.all")}
          </CtaLink>
          {showRefer ? (
            <Link
              href="/refer"
              className="group/refer inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm text-sm font-semibold text-teal-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 sm:justify-start"
              data-testid="requirements-refer"
            >
              {t("reqs.refer")}
              <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover/refer:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100" />
            </Link>
          ) : null}
        </div>
        <JobAlerts loadCountries className="mt-8" />
      </div>
    </section>
  );
}

/**
 * Server component: loads and shows the latest requirements (RequirementsSection). `excludeSlug` leaves out the
 * requirement the visitor is reading (detail page).
 */
export async function LatestRequirements({ limit = 8, excludeSlug, ...props }: SectionProps & { limit?: number; excludeSlug?: string | null }) {
  const size = Math.min(Math.max(Math.trunc(limit), 1), 24);
  const result = await loadPosterPage({ pageSize: excludeSlug ? size + 1 : size });
  return <RequirementsSection posters={pickPosters(result.items, { limit: size, excludeSlug })} {...props} />;
}
