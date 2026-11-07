import { CalendarDays, Images, MapPin } from "lucide-react";
import type { Metadata } from "next";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { getPublishedEntries } from "@/modules/content/queries";

import { EntryCard, EntryGrid } from "../news/_components/entry-card";
import { PublicHero, PublicSection } from "../news/_components/public-hero";
import { assetFor, emptyEntryPage, listingMetadata, safeLoad, type PageSearchParams } from "../news/_lib/cms";
import { calendarDate, pageParam } from "../news/_lib/text";

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  return listingMetadata("Gallery", "Photos and videos from Venkat Sai Global events, training and work.", "/gallery", { noindex: pageParam(sp.page) > 1 });
}

export default async function GalleryPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const result = await safeLoad("gallery", () => getPublishedEntries("gallery_albums", { page: pageParam(sp.page), pageSize: 12 }), emptyEntryPage<"gallery_albums">());

  return (
    <>
      <PublicHero
        eyebrow="Gallery"
        title="Photos and videos"
        description="Albums from our events, training sessions and work. People appear only with their recorded consent."
        breadcrumbs={[{ label: "Gallery" }]}
      />
      <div className="container-page">
        <PublicSection>
          {result.items.length ? (
            <>
              <EntryGrid label="Albums">
                {result.items.map((entry) => {
                  const d = entry.data;
                  const visible = (d.assetIds ?? []).filter((id) => result.assets[id]);
                  const cover = assetFor(result.assets, entry.heroAssetId) ?? (visible[0] ? assetFor(result.assets, visible[0]) : null);
                  const date = calendarDate(d.eventDate);
                  return (
                    <EntryCard
                      key={entry.id}
                      href={entry.path ?? `/gallery/${entry.slug}`}
                      title={entry.title}
                      summary={entry.summary || d.description}
                      image={cover && (cover.kind === "image" || (cover.kind !== "document" && cover.thumbnailUrl)) ? cover : null}
                      placeholderIcon={<Images />}
                      imageAspect="aspect-[4/3]"
                      meta={
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <Images className="size-3.5" aria-hidden="true" />
                            {visible.length} {visible.length === 1 ? "item" : "items"}
                          </span>
                          {date ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="size-3.5" aria-hidden="true" />
                              <DateText value={date} dateOnly />
                            </span>
                          ) : null}
                          {d.location ? (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="size-3.5" aria-hidden="true" />
                              {d.location}
                            </span>
                          ) : null}
                        </>
                      }
                    />
                  );
                })}
              </EntryGrid>
              <Pagination className="mt-10" pathname="/gallery" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="albums" />
            </>
          ) : (
            <EmptyState
              icon={<Images />}
              titleAs="h2"
              title="No albums published yet"
              description="Photos from our events and training sessions will appear here once they are published."
              primaryAction={{ label: "Watch videos", href: "/videos" }}
              secondaryAction={{ label: "Upcoming events", href: "/events", variant: "outline" }}
            />
          )}
        </PublicSection>
      </div>
    </>
  );
}
