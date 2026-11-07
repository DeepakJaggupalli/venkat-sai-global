import { CalendarDays, CalendarRange, Images, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";

import { MediaGallery } from "../_components/media-gallery";
import { toGalleryItems } from "../_lib/gallery-items";
import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../../news/_components/public-hero";
import { abs, breadcrumbJsonLd, entryMetadata, imagesFor, loadEntry, readPreview, type PageSearchParams } from "../../news/_lib/cms";
import { calendarDate } from "../../news/_lib/text";

type Props = { params: Promise<{ slug: string }>; searchParams: PageSearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("gallery_albums", slug, readPreview(sp));
  if (!detail) return { title: "Album not found", robots: { index: false } };
  return entryMetadata(detail, { path: `/gallery/${slug}`, type: "website", fallbackDescription: detail.entry.data.description ?? undefined });
}

export default async function GalleryAlbumPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("gallery_albums", slug, readPreview(sp));
  if (!detail) notFound();
  const { entry, assets, references, preview } = detail;
  const d = entry.data;
  const items = toGalleryItems(imagesFor(assets, d.assetIds));
  const date = calendarDate(d.eventDate);
  const event = d.relatedEventId ? references[d.relatedEventId] : null;

  return (
    <>
      <PreviewRibbon preview={preview} />
      {!preview ? (
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "ImageGallery",
              name: entry.title,
              ...(d.description || entry.summary ? { description: d.description || entry.summary } : {}),
              url: abs(`/gallery/${slug}`),
            },
            breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Gallery", url: abs("/gallery") }, { name: entry.title }]),
          ]}
        />
      ) : null}
      <PublicHero
        eyebrow="Album"
        title={entry.title}
        description={d.description || entry.summary}
        breadcrumbs={[{ label: "Gallery", href: "/gallery" }, { label: entry.title }]}
        meta={
          <>
            <MetaItem icon={<Images />}>
              {items.length} {items.length === 1 ? "item" : "items"}
            </MetaItem>
            {date ? (
              <MetaItem icon={<CalendarDays />}>
                <DateText value={date} dateOnly />
              </MetaItem>
            ) : null}
            {d.location ? <MetaItem icon={<MapPin />}>{d.location}</MetaItem> : null}
            {event ? (
              <MetaItem icon={<CalendarRange />}>
                <Link href={event.path ?? `/events/${event.slug}`} className="font-medium text-teal-strong hover:underline">
                  {event.title}
                </Link>
              </MetaItem>
            ) : null}
          </>
        }
      />
      <div className="container-page">
        <PublicSection>
          {items.length ? (
            <>
              <p className="mb-4 text-sm text-muted-foreground">Select a photo or video to view it larger. Use the arrow keys to move between items.</p>
              <MediaGallery items={items} label={`Album: ${entry.title}`} />
            </>
          ) : (
            <EmptyState icon={<Images />} titleAs="h2" title="No photos to show" description="The items in this album are not available publicly right now." primaryAction={{ label: "All albums", href: "/gallery" }} />
          )}
        </PublicSection>
      </div>
    </>
  );
}
