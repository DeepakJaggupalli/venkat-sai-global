import { Star } from "lucide-react";

import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { listPublicWorkerReviews, type PublicWorkerReview } from "@/modules/worker-reviews/queries";
import { ratingText } from "@/modules/worker-reviews/schemas";

import { CtaLink } from "./cta-link";
import { Flag } from "./flag";
import { Section, SectionHeading, type SectionTone } from "./section";

/**
 * Reviews from placed workers on the public website: only reviews staff approved and the worker allowed us to show
 * (src/modules/worker-reviews). Real reviews only: the section renders nothing at all until there is one.
 */

const MONTH_YEAR = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** 1 to 5 stars: filled ones in the accent colour, empty ones outlined. Announced as "Rated 4 out of 5 (Very good)". */
export function ReviewStars({ rating, size = "md", className }: { rating: number; size?: "sm" | "md"; className?: string }) {
  const value = Math.min(5, Math.max(1, Math.round(rating)));
  return (
    <span role="img" aria-label={`Rated ${ratingText(value)}`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          strokeWidth={1.75}
          className={cn(size === "sm" ? "size-4" : "size-5", n <= value ? "fill-current text-teal-strong" : "text-[#c9cdd5]")}
        />
      ))}
    </span>
  );
}

/** One review: stars, the worker's words, the name they chose, trade, country flag and month. */
export function WorkerReviewCard({ review, className }: { review: PublicWorkerReview; className?: string }) {
  return (
    <figure className={cn("flex h-full flex-col rounded-[20px] border border-border bg-white p-6 shadow-card", className)} data-testid="worker-review">
      <ReviewStars rating={review.rating} />
      <blockquote className="mt-4 flex-1 text-base leading-7 text-foreground">
        <p dir="auto" className="break-words whitespace-pre-line">
          {review.body}
        </p>
      </blockquote>
      <figcaption className="mt-5 border-t border-border pt-4 text-sm">
        <p dir="auto" className="font-semibold break-words text-foreground">
          {review.displayName}
        </p>
        <p className="mt-0.5 break-words text-muted-foreground">{review.trade}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          {review.countryName ? (
            <span className="inline-flex items-center gap-1.5">
              <Flag code={review.countryCode} />
              {review.countryName}
            </span>
          ) : null}
          <time dateTime={review.writtenAt.toISOString()}>{MONTH_YEAR.format(review.writtenAt)}</time>
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * Server component: a band of the latest approved worker reviews. Renders NOTHING when there are none (or when the
 * reviews cannot be loaded), so pages can include it unconditionally.
 *
 *   <WorkerReviewsSection tone="subtle" limit={6} showAllLink />
 */
export async function WorkerReviewsSection({
  tone = "white",
  limit = 6,
  eyebrow,
  heading,
  intro,
  showAllLink = false,
  allLabel,
  id = "worker-reviews",
  className,
}: {
  tone?: SectionTone;
  /** How many reviews to show (1 to 48). */
  limit?: number;
  /** Translated section text (the homepage passes its own language); English defaults otherwise. */
  eyebrow?: string | null;
  heading?: string | null;
  intro?: string | null;
  /** "All reviews" link to /success-stories (for the homepage). */
  showAllLink?: boolean;
  /** Text of that link (default "All reviews"). */
  allLabel?: string | null;
  /** Section id (anchor), also used for the heading id. */
  id?: string;
  className?: string;
}) {
  let reviews: PublicWorkerReview[];
  try {
    reviews = await listPublicWorkerReviews(limit);
  } catch (error) {
    logger.warn("Worker reviews could not be loaded", { error });
    return null;
  }
  if (!reviews.length) return null;
  const headingId = `${id}-title`;
  const title = heading?.trim() || "What our workers say";
  return (
    <Section id={id} tone={tone} labelledBy={headingId} className={className} data-testid="worker-reviews">
      <SectionHeading
        id={headingId}
        eyebrow={eyebrow?.trim() || "Reviews"}
        title={title}
        intro={intro?.trim() || "Reviews from workers we placed abroad, shown with their permission and in their own words."}
        action={
          showAllLink ? (
            <CtaLink href="/success-stories#worker-reviews" cta="all_worker_reviews" location="worker_reviews" variant="outline" arrow>
              {allLabel?.trim() || "All reviews"}
            </CtaLink>
          ) : undefined
        }
      />
      <ul className="mt-10 grid gap-6 sm:mt-12 md:grid-cols-2 lg:grid-cols-3" aria-label={title}>
        {reviews.map((review) => (
          <li key={review.id}>
            <WorkerReviewCard review={review} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
