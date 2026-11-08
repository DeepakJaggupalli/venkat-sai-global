import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { loadPosterPage } from "./data";
import { PosterGrid } from "./poster-card";

/**
 * Server component: grid of the latest published requirement posters (newest first), each linking to its
 * detail page, with an "All requirements" link to /requirements. Renders nothing when there are none.
 */
export async function LatestRequirements({ limit = 8, heading = "Latest requirements", className }: { limit?: number; heading?: string; className?: string }) {
  const result = await loadPosterPage({ pageSize: Math.min(Math.max(Math.trunc(limit), 1), 24) });
  const posters = result.items.filter((p) => p.poster);
  if (!posters.length) return null;
  const headingId = "latest-requirements-heading";
  return (
    <section aria-labelledby={headingId} className={cn("py-12 sm:py-16", className)} data-testid="latest-requirements">
      <div className="container-page">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 id={headingId} className="font-heading text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            {heading}
          </h2>
          <Link href="/requirements" className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-teal-strong underline-offset-4 hover:underline">
            All requirements
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <PosterGrid posters={posters} label={heading} />
      </div>
    </section>
  );
}
