import { cn } from "@/lib/utils";

import { CtaLink } from "../cta-link";
import { SectionHeading } from "../section";
import { loadPosterPage } from "./data";
import { PosterGrid } from "./poster-card";

/**
 * Server component: grid of the latest published requirement posters (newest first), each linking to its
 * detail page, with an "All requirements" link to /requirements. Renders nothing when there are none.
 */
export async function LatestRequirements({
  limit = 8,
  heading = "Latest requirements",
  intro = "New openings from our employers. Applying is free: send your CV and trade, and we call you.",
  className,
  tone = "white",
}: {
  limit?: number;
  heading?: string;
  intro?: string | null;
  className?: string;
  tone?: "white" | "subtle";
}) {
  const result = await loadPosterPage({ pageSize: Math.min(Math.max(Math.trunc(limit), 1), 24) });
  const posters = result.items.filter((p) => p.poster);
  if (!posters.length) return null;
  const headingId = "latest-requirements-heading";
  return (
    <section aria-labelledby={headingId} className={cn("py-16 sm:py-20 lg:py-28", tone === "subtle" ? "bg-surface-subtle" : "bg-white", className)} data-testid="latest-requirements">
      <div className="container-page">
        <SectionHeading
          id={headingId}
          eyebrow="Now hiring"
          title={heading}
          intro={intro}
          action={
            <CtaLink href="/requirements" cta="all_requirements" location="latest_requirements" variant="outline" arrow>
              All requirements
            </CtaLink>
          }
        />
        <PosterGrid posters={posters} label={heading} className="mt-12" />
      </div>
    </section>
  );
}
