import { CalendarDays, Captions, Play, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { getPublishedEntries } from "@/modules/content/queries";

import { EntryCard, EntryGrid } from "../../news/_components/entry-card";
import { PublicHero, PublicSection } from "../../news/_components/public-hero";
import { assetFor, emptyEntryPage, listingMetadata, safeLoad, siteTimeZone, type PageSearchParams } from "../../news/_lib/cms";
import { normaliseQuery, pageParam } from "../../news/_lib/text";

function categoryParam(value: string | string[] | undefined): string | undefined {
  const raw = normaliseQuery(value, 60);
  return raw && /^[\p{L}\p{N}][\p{L}\p{N} &-]*$/u.test(raw) ? raw : undefined;
}

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const category = categoryParam(sp.category);
  return listingMetadata(category ? `${category} · Videos` : "Videos", "Videos about careers, training and working with Venkat Sai Global.", "/videos", {
    noindex: pageParam(sp.page) > 1 || Boolean(category),
  });
}

export default async function VideosPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const category = categoryParam(sp.category);
  const result = await safeLoad("videos", () => getPublishedEntries("videos", { category, page: pageParam(sp.page), pageSize: 12 }), emptyEntryPage<"videos">());
  const tz = siteTimeZone();

  return (
    <>
      <PublicHero
        eyebrow="Videos"
        title={category ?? "Videos"}
        description="Watch guidance on careers, training and safe recruitment. Videos load from YouTube or Vimeo only when you choose to play them."
        breadcrumbs={category ? [{ label: "Videos", href: "/videos" }, { label: category }] : [{ label: "Videos" }]}
        actions={
          category ? (
            <Link href="/videos" className="text-sm font-semibold text-teal-strong underline-offset-4 hover:underline">
              Show all videos
            </Link>
          ) : undefined
        }
      />
      <div className="container-page">
        <PublicSection>
          {result.items.length ? (
            <>
              <EntryGrid label="Videos">
                {result.items.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    href={entry.path ?? `/videos/${entry.slug}`}
                    title={entry.title}
                    summary={entry.summary || entry.data.description}
                    eyebrow={entry.data.category || undefined}
                    image={assetFor(result.assets, entry.heroAssetId)}
                    placeholderIcon={<Video />}
                    overlay={
                      <span className="rounded-full bg-white/90 p-3 text-navy shadow">
                        <Play className="size-5 fill-current" />
                      </span>
                    }
                    meta={
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" aria-hidden="true" />
                          <DateText value={entry.publishedAt} timeZone={tz} />
                        </span>
                        {entry.data.captionsAvailable ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Captions className="size-3.5" aria-hidden="true" />
                            Captions
                          </span>
                        ) : null}
                        {entry.data.transcript ? <span>Transcript</span> : null}
                      </>
                    }
                  />
                ))}
              </EntryGrid>
              <Pagination className="mt-10" pathname="/videos" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="videos" />
            </>
          ) : (
            <EmptyState
              icon={<Video />}
              titleAs="h2"
              title={category ? `No videos in ${category} yet` : "No videos published yet"}
              description="Videos will appear here once they are published."
              primaryAction={{ label: "Read the blog", href: "/blog" }}
              secondaryAction={{ label: "Photo gallery", href: "/gallery", variant: "outline" }}
            />
          )}
        </PublicSection>
      </div>
    </>
  );
}
