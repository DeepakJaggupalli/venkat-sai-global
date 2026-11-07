import "server-only";

import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { BRAND } from "@/config/site";
import type { CmsCollection } from "@/db/schema";
import { absoluteUrl, env } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { CollectionData } from "@/modules/content/collections";
import { PREVIEW_QUERY_PARAM } from "@/modules/content/links";
import { getPublishedEntryBySlug, getSingletonData } from "@/modules/content/queries";
import type { AssetMap, PublicMediaAsset, PublishedEntry, PublishedEntryDetail, PublishedEntryPage } from "@/modules/content/types";
import { getSettings } from "@/modules/settings";

/** `searchParams` prop of a public page. */
export type PageSearchParams = Promise<SearchParams>;

/** First value of a search param. */
export function firstParam(sp: SearchParams | undefined, key: string): string | undefined {
  const value = sp?.[key];
  return Array.isArray(value) ? value[0] : value;
}

/** The CMS preview token (`?preview=`), or null. The content module verifies it. */
export function readPreview(sp: SearchParams | undefined): string | null {
  const token = firstParam(sp, PREVIEW_QUERY_PARAM)?.trim();
  return token && token.length <= 500 ? token : null;
}

/**
 * One published entry (or its draft with a valid preview token), memoised per request so
 * generateMetadata and the page share one query.
 */
export const loadEntry = cache(
  <K extends CmsCollection>(collection: K, slug: string, preview: string | null): Promise<PublishedEntryDetail<K> | null> =>
    getPublishedEntryBySlug(collection, slug, { preview }),
);

/** Published site settings (contact details, grievance officer, legal entity), or null. */
export const loadSiteSettings = cache(async (): Promise<CollectionData<"site_settings"> | null> => {
  try {
    return await getSingletonData("site_settings");
  } catch {
    return null;
  }
});

/** Privacy timelines administered in settings (never hardcoded in copy). */
export const loadPrivacyTimelines = cache(async () => {
  const s = await getSettings(["privacy.grievance_ack_hours", "privacy.grievance_resolution_days", "privacy.data_request_sla_days"]);
  return {
    ackHours: Number(s["privacy.grievance_ack_hours"]),
    resolutionDays: Number(s["privacy.grievance_resolution_days"]),
    dataRequestDays: Number(s["privacy.data_request_sla_days"]),
  };
});

/** A public media item from a resolved asset map (missing → not public). */
export function assetFor(assets: AssetMap, id: string | null | undefined): PublicMediaAsset | null {
  return id ? (assets[id] ?? null) : null;
}

/** Images only, in the given order. */
export function imagesFor(assets: AssetMap, ids: readonly string[] | null | undefined): PublicMediaAsset[] {
  return (ids ?? []).map((id) => assets[id]).filter((a): a is PublicMediaAsset => Boolean(a));
}

/**
 * Metadata for a CMS entry page: SEO title / description with fallbacks, canonical URL, Open Graph image,
 * and noindex for previews and entries marked noindex.
 */
export function entryMetadata(
  detail: PublishedEntryDetail<CmsCollection>,
  opts: { path: string; type?: "article" | "website"; fallbackDescription?: string } = { path: "/" },
): Metadata {
  const { entry, assets, preview } = detail;
  const title = entry.seo.title?.trim() || entry.title;
  const description = entry.seo.description?.trim() || entry.summary || opts.fallbackDescription || undefined;
  const image = assetFor(assets, entry.seo.ogImageAssetId) ?? assetFor(assets, entry.heroAssetId);
  const imageUrl = image && image.kind === "image" ? (image.variants.lg ?? image.url) : null;
  const noindex = preview || entry.seo.noindex === true;
  return {
    title,
    description,
    alternates: { canonical: entry.seo.canonicalUrl || opts.path },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: opts.type ?? "article",
      title,
      description,
      siteName: BRAND.name,
      url: opts.path,
      ...(imageUrl ? { images: [{ url: imageUrl, alt: image?.alt ?? "" }] } : {}),
      ...(opts.type !== "website" ? { publishedTime: entry.publishedAt.toISOString(), modifiedTime: entry.contentUpdatedAt.toISOString() } : {}),
    },
  };
}

/** Metadata for a listing page. */
export function listingMetadata(title: string, description: string, path: string, opts: { noindex?: boolean } = {}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", title, description, url: path, siteName: BRAND.name },
  };
}

/** schema.org publisher block (only facts held in BRAND / site settings). */
export function publisherJsonLd(): Record<string, unknown> {
  return { "@type": "Organization", name: BRAND.name, legalName: BRAND.legalEntity };
}

/** schema.org Article / NewsArticle / BlogPosting for an entry. */
export function articleJsonLd(
  entry: PublishedEntry,
  opts: { type: "Article" | "NewsArticle" | "BlogPosting"; url: string; imageUrl?: string | null; author?: string | null },
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": opts.type,
    headline: entry.title.slice(0, 110),
    ...(entry.summary ? { description: entry.summary } : {}),
    datePublished: entry.publishedAt.toISOString(),
    dateModified: entry.contentUpdatedAt.toISOString(),
    mainEntityOfPage: opts.url,
    url: opts.url,
    ...(opts.imageUrl ? { image: [opts.imageUrl] } : {}),
    author: opts.author ? { "@type": "Person", name: opts.author } : publisherJsonLd(),
    publisher: publisherJsonLd(),
  };
}

/** schema.org BreadcrumbList from crumbs with absolute URLs. */
export function breadcrumbJsonLd(items: { name: string; url?: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, ...(item.url ? { item: item.url } : {}) })),
  };
}

/** Site time zone for schedules and dates on public pages (visitors are not signed in). */
export function siteTimeZone(): string {
  return env().DEFAULT_TIMEZONE;
}

/** Absolute URL for structured data and canonical links. */
export function abs(path: string): string {
  return absoluteUrl(path);
}

/**
 * Run a public data source; a failure (module mid-migration, slow query) degrades to the fallback and is
 * logged instead of taking down the page. notFound()/redirect() signals keep propagating.
 */
export async function safeLoad<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_")) throw error;
    unstable_rethrow(error);
    logger.warn("Public content source failed", { source: label, error });
    return fallback;
  }
}

/** Empty listing page (fallback for safeLoad). */
export function emptyEntryPage<K extends CmsCollection>(pageSize = 12): PublishedEntryPage<K> {
  return { items: [], total: 0, page: 1, pageSize, pageCount: 0, assets: {}, references: {} };
}
