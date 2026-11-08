import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { entryMedia } from "@/components/public/services/featured-service-card";
import { ServiceMedia } from "@/components/public/services/service-media";
import { cn } from "@/lib/utils";
import type { AssetMap, PublishedEntry } from "@/modules/content/types";

/**
 * One card per training course family (services tagged "training-course"): the business's photo or a credited
 * stock photograph, the summary and the sub-categories (processes, positions, topics) as chips.
 */
export function CourseFamilyGrid({
  families,
  assets,
  compact = false,
  headingLevel: Heading = "h3",
  className,
}: {
  families: readonly PublishedEntry<"services">[];
  assets: AssetMap | undefined;
  /** Smaller cards without topic chips (used in the "All services" listing). */
  compact?: boolean;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  if (!families.length) return null;
  return (
    <ul className={cn("grid gap-5 sm:grid-cols-2", compact ? "lg:grid-cols-4" : "lg:grid-cols-3", className)} data-testid="course-families">
      {families.map((f) => {
        const topics = (f.data.whatWeProvide ?? []).map((t) => t.title?.trim()).filter((t): t is string => Boolean(t));
        const media = entryMedia(f, assets);
        return (
          <li key={f.id}>
            <article className="card-surface lift group relative flex h-full flex-col overflow-hidden rounded-2xl">
              <ServiceMedia
                asset={media?.kind === "image" ? media : null}
                iconName={f.data.iconName}
                slug={f.slug}
                decorative
                zoomOnHover
                className={cn("rounded-none", compact ? "aspect-[16/10]" : "aspect-[4/3]")}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              />
              <div className="flex flex-1 flex-col p-5">
                <Heading className="font-heading text-lg font-bold tracking-tight text-foreground">
                  <Link href={f.path ?? `/services/${f.slug}`} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
                    {f.title}
                  </Link>
                </Heading>
                {f.summary ? <p className={cn("mt-2 text-sm leading-relaxed text-muted-foreground", compact && "line-clamp-3")}>{f.summary}</p> : null}
                {!compact && topics.length ? (
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`${f.title}: what is covered`}>
                    {topics.slice(0, 8).map((t) => (
                      <li key={t} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-foreground">
                  Course details <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
