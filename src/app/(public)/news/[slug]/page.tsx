import { CalendarDays, Clock, Newspaper, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DateText } from "@/components/shared/date-text";
import { NEWS_CATEGORY_OPTIONS } from "@/modules/content/collections";
import { getPublishedEntries } from "@/modules/content/queries";

import { toGalleryItems } from "../../gallery/_lib/gallery-items";
import { MediaGallery } from "../../gallery/_components/media-gallery";
import { ArticleLayout, FactBox, Prose, TableOfContents } from "../_components/article-parts";
import { CmsImage } from "../_components/cms-image";
import { EntryCard, EntryGrid } from "../_components/entry-card";
import { JsonLd } from "../_components/json-ld";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../_components/public-hero";
import { abs, articleJsonLd, assetFor, breadcrumbJsonLd, entryMetadata, imagesFor, loadEntry, readPreview, safeLoad, siteTimeZone, type PageSearchParams } from "../_lib/cms";
import { readingMinutes, withHeadingAnchors } from "../_lib/text";

type Props = { params: Promise<{ slug: string }>; searchParams: PageSearchParams };

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(NEWS_CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("news", slug, readPreview(sp));
  if (!detail) return { title: "News item not found", robots: { index: false } };
  return entryMetadata(detail, { path: `/news/${slug}`, type: "article" });
}

export default async function NewsDetailPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("news", slug, readPreview(sp));
  if (!detail) notFound();
  const { entry, assets, preview } = detail;
  const data = entry.data;
  const tz = siteTimeZone();
  const hero = assetFor(assets, entry.heroAssetId);
  const body = withHeadingAnchors(data.body);
  const gallery = toGalleryItems(imagesFor(assets, data.galleryAssetIds));
  const categoryLabel = CATEGORY_LABEL[data.category] ?? "News";
  const url = abs(`/news/${slug}`);
  const related = preview
    ? null
    : await safeLoad("news.related", () => getPublishedEntries("news", { category: data.category, limit: 3, excludeIds: [entry.id] }), null);

  return (
    <>
      <PreviewRibbon preview={preview} />
      {!preview ? (
        <JsonLd
          data={[
            articleJsonLd(entry, { type: "NewsArticle", url, imageUrl: hero?.kind === "image" ? (hero.variants.lg ?? hero.url) : null, author: data.author }),
            breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "News", url: abs("/news") }, { name: entry.title }]),
          ]}
        />
      ) : null}
      <PublicHero
        eyebrow={
          <Link href={`/news?category=${data.category}`} className="underline-offset-4 hover:underline">
            {categoryLabel}
          </Link>
        }
        title={entry.title}
        description={entry.summary}
        breadcrumbs={[{ label: "News", href: "/news" }, { label: entry.title }]}
        meta={
          <>
            <MetaItem icon={<CalendarDays />}>
              Published <DateText value={entry.publishedAt} timeZone={tz} />
            </MetaItem>
            {data.author ? <MetaItem icon={<UserRound />}>{data.author}</MetaItem> : null}
            <MetaItem icon={<Clock />}>{readingMinutes(data.body)} min read</MetaItem>
          </>
        }
      />
      <ArticleLayout
        aside={
          <>
            <TableOfContents headings={body.headings} />
            <FactBox title="About this item">
              <dl className="space-y-2">
                <div>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-medium">{categoryLabel}</dd>
                </div>
                {entry.contentUpdatedAt.getTime() - entry.publishedAt.getTime() > 60_000 ? (
                  <div>
                    <dt className="text-muted-foreground">Last updated</dt>
                    <dd className="font-medium">
                      <DateText value={entry.contentUpdatedAt} timeZone={tz} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            </FactBox>
          </>
        }
      >
        {hero && hero.kind === "image" ? (
          <figure className="mb-8">
            <CmsImage asset={hero} priority className="rounded-xl" sizes="(min-width: 1024px) 760px, 100vw" />
            {hero.caption || hero.credit ? (
              <figcaption className="mt-2 text-sm text-muted-foreground">
                {hero.caption}
                {hero.credit ? <span className="ml-1">({hero.credit})</span> : null}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
        <Prose html={body.html} />
        {gallery.length ? (
          <PublicSection title="Photos and videos" id="media" className="pb-0">
            <MediaGallery items={gallery} label={`Photos and videos: ${entry.title}`} />
          </PublicSection>
        ) : null}
      </ArticleLayout>
      {related?.items.length ? (
        <div className="border-t border-border/70 bg-surface-subtle">
          <div className="container-page">
            <PublicSection title={`More ${categoryLabel.toLowerCase()}`} id="related" action={<Link href="/news" className="text-sm font-semibold text-teal-strong hover:underline">All news</Link>}>
              <EntryGrid label={`More ${categoryLabel.toLowerCase()}`}>
                {related.items.map((item) => (
                  <EntryCard
                    key={item.id}
                    headingLevel="h3"
                    href={item.path ?? `/news/${item.slug}`}
                    title={item.title}
                    summary={item.summary}
                    image={assetFor(related.assets, item.heroAssetId)}
                    placeholderIcon={<Newspaper />}
                    meta={<DateText value={item.publishedAt} timeZone={tz} />}
                  />
                ))}
              </EntryGrid>
            </PublicSection>
          </div>
        </div>
      ) : null}
    </>
  );
}
