import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { AssetMap, PublishedEntry } from "@/modules/content/types";

import { primaryMedia, ServiceMedia } from "./service-media";

/** Tags that change how a service is presented (set on the entry in the CMS). */
export const SERVICE_TAGS = { trainingHub: "training-hub", trainingCourse: "training-course", courseFee: "course-fee" } as const;

export function hasTag(entry: Pick<PublishedEntry, "tags">, tag: string): boolean {
  return (entry.tags ?? []).includes(tag);
}

export function entryMedia(entry: PublishedEntry<"services">, assets: AssetMap | undefined) {
  const hero = entry.heroAssetId ? (assets?.[entry.heroAssetId] ?? null) : null;
  const gallery = (entry.data.galleryAssetIds ?? []).map((id) => assets?.[id]).filter((a): a is NonNullable<typeof a> => Boolean(a));
  return primaryMedia(hero, gallery);
}

/** Large card for one of the main (featured) services on /services. */
export function FeaturedServiceCard({ entry, assets, className }: { entry: PublishedEntry<"services">; assets: AssetMap | undefined; className?: string }) {
  const href = entry.path ?? `/services/${entry.slug}`;
  const highlights = (entry.data.whatWeProvide ?? []).map((i) => i.title?.trim()).filter((t): t is string => Boolean(t)).slice(0, 4);
  const media = entryMedia(entry, assets);
  return (
    <article className={cn("card-surface lift group relative flex h-full flex-col overflow-hidden rounded-3xl", className)}>
      <ServiceMedia
        asset={media?.kind === "image" ? media : null}
        iconName={entry.data.iconName}
        slug={entry.slug}
        decorative
        zoomOnHover
        className="aspect-[16/10] rounded-none"
        sizes="(min-width: 1024px) 33vw, 100vw"
      />
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <h3 className="font-display text-2xl text-foreground sm:text-[1.75rem]">
          <Link href={href} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
            {entry.title}
          </Link>
        </h3>
        {entry.summary ? <p className="mt-3 text-base leading-relaxed text-muted-foreground">{entry.summary}</p> : null}
        {highlights.length ? (
          <ul className="mt-5 space-y-2">
            {highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-strong" />
                {h}
              </li>
            ))}
          </ul>
        ) : null}
        <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-semibold text-foreground">
          Learn more <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
