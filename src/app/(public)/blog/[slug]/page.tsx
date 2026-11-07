import { BookOpen, CalendarDays, Clock, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DateText } from "@/components/shared/date-text";
import { getPublishedEntries } from "@/modules/content/queries";

import { MediaGallery } from "../../gallery/_components/media-gallery";
import { toGalleryItems } from "../../gallery/_lib/gallery-items";
import { ArticleLayout, FactBox, Prose, TableOfContents } from "../../news/_components/article-parts";
import { CmsImage } from "../../news/_components/cms-image";
import { EntryCard, EntryGrid } from "../../news/_components/entry-card";
import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../../news/_components/public-hero";
import { abs, articleJsonLd, assetFor, breadcrumbJsonLd, entryMetadata, imagesFor, loadEntry, readPreview, safeLoad, siteTimeZone, type PageSearchParams } from "../../news/_lib/cms";
import { readingMinutes, withHeadingAnchors } from "../../news/_lib/text";

type Props = { params: Promise<{ slug: string }>; searchParams: PageSearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("blog_posts", slug, readPreview(sp));
  if (!detail) return { title: "Article not found", robots: { index: false } };
  return entryMetadata(detail, { path: `/blog/${slug}`, type: "article" });
}

export default async function BlogPostPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("blog_posts", slug, readPreview(sp));
  if (!detail) notFound();
  const { entry, assets, preview } = detail;
  const data = entry.data;
  const tz = siteTimeZone();
  const hero = assetFor(assets, entry.heroAssetId);
  const body = withHeadingAnchors(data.body);
  const minutes = readingMinutes(data.body);
  const gallery = toGalleryItems(imagesFor(assets, data.galleryAssetIds));
  const url = abs(`/blog/${slug}`);
  const more = preview
    ? null
    : await safeLoad("blog.more", () => getPublishedEntries("blog_posts", { limit: 3, excludeIds: [entry.id], category: data.category || undefined }), null);

  return (
    <>
      <PreviewRibbon preview={preview} />
      {!preview ? (
        <JsonLd
          data={[
            articleJsonLd(entry, { type: "BlogPosting", url, imageUrl: hero?.kind === "image" ? (hero.variants.lg ?? hero.url) : null, author: data.author }),
            breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Blog", url: abs("/blog") }, { name: entry.title }]),
          ]}
        />
      ) : null}
      <PublicHero
        eyebrow={
          data.category ? (
            <Link href={`/blog?category=${encodeURIComponent(data.category)}`} className="underline-offset-4 hover:underline">
              {data.category}
            </Link>
          ) : (
            "Blog"
          )
        }
        title={entry.title}
        description={entry.summary}
        breadcrumbs={[{ label: "Blog", href: "/blog" }, { label: entry.title }]}
        meta={
          <>
            {data.author ? <MetaItem icon={<UserRound />}>By {data.author}</MetaItem> : null}
            <MetaItem icon={<CalendarDays />}>
              <DateText value={entry.publishedAt} timeZone={tz} />
            </MetaItem>
            <MetaItem icon={<Clock />}>{minutes} min read</MetaItem>
          </>
        }
      />
      <ArticleLayout
        aside={
          <>
            <TableOfContents headings={body.headings} />
            <FactBox title="About this article">
              <dl className="space-y-2">
                <div>
                  <dt className="text-muted-foreground">Author</dt>
                  <dd className="font-medium">{data.author || "Venkat Sai Global team"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reading time</dt>
                  <dd className="font-medium">About {minutes} min</dd>
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
            {hero.caption ? <figcaption className="mt-2 text-sm text-muted-foreground">{hero.caption}</figcaption> : null}
          </figure>
        ) : null}
        <Prose html={body.html} />
        {gallery.length ? (
          <PublicSection title="Images" id="media" className="pb-0">
            <MediaGallery items={gallery} label={`Images: ${entry.title}`} />
          </PublicSection>
        ) : null}
      </ArticleLayout>
      {more?.items.length ? (
        <div className="border-t border-border/70 bg-surface-subtle">
          <div className="container-page">
            <PublicSection
              title="More articles"
              id="more"
              action={
                <Link href="/blog" className="text-sm font-semibold text-teal-strong hover:underline">
                  All articles
                </Link>
              }
            >
              <EntryGrid label="More articles">
                {more.items.map((item) => (
                  <EntryCard
                    key={item.id}
                    headingLevel="h3"
                    href={item.path ?? `/blog/${item.slug}`}
                    title={item.title}
                    summary={item.summary}
                    image={assetFor(more.assets, item.heroAssetId)}
                    placeholderIcon={<BookOpen />}
                    meta={<span>{readingMinutes(item.data.body)} min read</span>}
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
