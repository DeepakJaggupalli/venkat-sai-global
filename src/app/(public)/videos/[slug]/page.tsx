import { CalendarDays, Captions, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { parseVideoEmbedUrl } from "@/modules/content/embeds";

import { Prose } from "../../news/_components/article-parts";
import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../../news/_components/public-hero";
import { abs, assetFor, breadcrumbJsonLd, entryMetadata, loadEntry, readPreview, siteTimeZone, type PageSearchParams } from "../../news/_lib/cms";
import { VideoEmbed } from "../_components/video-embed";

type Props = { params: Promise<{ slug: string }>; searchParams: PageSearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("videos", slug, readPreview(sp));
  if (!detail) return { title: "Video not found", robots: { index: false } };
  return entryMetadata(detail, { path: `/videos/${slug}`, type: "website", fallbackDescription: detail.entry.data.description ?? undefined });
}

export default async function VideoPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("videos", slug, readPreview(sp));
  if (!detail) notFound();
  const { entry, assets, preview } = detail;
  const d = entry.data;
  const embed = parseVideoEmbedUrl(d.embedUrl);
  const poster = assetFor(assets, entry.heroAssetId);
  const posterUrl = poster?.kind === "image" ? (poster.variants.lg ?? poster.url) : null;
  const tz = siteTimeZone();

  return (
    <>
      <PreviewRibbon preview={preview} />
      {!preview && embed ? (
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "VideoObject",
              name: entry.title,
              description: d.description || entry.summary || entry.title,
              uploadDate: entry.publishedAt.toISOString(),
              embedUrl: embed.embedUrl,
              ...(posterUrl ? { thumbnailUrl: [posterUrl] } : {}),
              url: abs(`/videos/${slug}`),
            },
            breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Videos", url: abs("/videos") }, { name: entry.title }]),
          ]}
        />
      ) : null}
      <PublicHero
        eyebrow={
          d.category ? (
            <Link href={`/videos?category=${encodeURIComponent(d.category)}`} className="underline-offset-4 hover:underline">
              {d.category}
            </Link>
          ) : (
            "Video"
          )
        }
        title={entry.title}
        description={entry.summary}
        breadcrumbs={[{ label: "Videos", href: "/videos" }, { label: entry.title }]}
        meta={
          <>
            <MetaItem icon={<CalendarDays />}>
              <DateText value={entry.publishedAt} timeZone={tz} />
            </MetaItem>
            {d.captionsAvailable ? <MetaItem icon={<Captions />}>Captions available</MetaItem> : null}
            {d.transcript ? <MetaItem icon={<FileText />}>Transcript below</MetaItem> : null}
          </>
        }
      />
      <div className="container-page max-w-5xl py-10 sm:py-14">
        {embed ? (
          <VideoEmbed embedUrl={embed.embedUrl} provider={embed.provider} title={entry.title} posterUrl={posterUrl} watchUrl={embed.watchUrl} />
        ) : (
          <Callout tone="warning" title="This video cannot be played here">
            The video link is not available right now. Please try again later.
          </Callout>
        )}
        {d.description ? <p className="mt-8 max-w-[72ch] text-base leading-7 whitespace-pre-line">{d.description}</p> : null}
        {d.transcript ? (
          <PublicSection title="Transcript" id="transcript" className="pb-0">
            <details className="group rounded-xl border border-border/80 bg-card p-5">
              <summary className="cursor-pointer font-medium text-navy focus-visible:outline-2 focus-visible:outline-ring">Show the transcript</summary>
              <Prose html={d.transcript} className="mt-4" />
            </details>
          </PublicSection>
        ) : null}
      </div>
    </>
  );
}
