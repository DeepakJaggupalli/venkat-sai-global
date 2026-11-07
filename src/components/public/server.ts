import "server-only";

import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { BRAND, DEFAULT_SEO } from "@/config/site";
import type { CmsSeo } from "@/db/schema";
import { absoluteUrl } from "@/lib/env";
import { sp, type SearchParams } from "@/lib/http";
import { logger } from "@/lib/logger";
import { PREVIEW_QUERY_PARAM } from "@/modules/content/links";
import type { AssetMap } from "@/modules/content/types";

/**
 * Server helpers shared by the public marketing pages (src/app/(public)/…).
 *
 * `settle()` keeps one failing data source (a module mid-migration, a slow query) from taking down a whole
 * marketing page: the section that needed it simply renders its fallback, and the failure is logged.
 */
export async function settle<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isNavigationSignal(error)) throw error;
    unstable_rethrow(error);
    logger.warn("Public page data source failed", { source: label, error });
    return fallback;
  }
}

/** notFound()/redirect()/forbidden() throw special errors that must keep propagating. */
function isNavigationSignal(error: unknown): boolean {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
  return digest.startsWith("NEXT_") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK");
}

/** The CMS preview token from `?preview=` (signed and verified by the content module), or null. */
export function previewTokenFrom(params: SearchParams | undefined): string | null {
  const token = sp(params, PREVIEW_QUERY_PARAM);
  return token && token.length <= 512 ? token : null;
}

export type PageMetadataInput = {
  /** Page title (the root layout appends "| Venkat Sai Global"). */
  title: string;
  description?: string | null;
  /** Canonical path of the page, e.g. "/services/overseas-employment". */
  path: string;
  /** CMS SEO fields (title / description / OG image / noindex / canonical override). */
  seo?: CmsSeo | null;
  /** Assets resolved with the entry (the OG image must be one of them to be public). */
  assets?: AssetMap;
  /** Fallback social image (e.g. the entry hero). */
  imageAssetId?: string | null;
  /** Force noindex (previews, empty states). */
  noindex?: boolean;
  /** Use the title as-is (homepage) instead of the "%s | Venkat Sai Global" template. */
  absoluteTitle?: boolean;
};

function safeCanonical(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

/** Metadata for a public page: CMS SEO first, then the page's own title/summary, canonical URL, OG/Twitter. */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const seo = input.seo ?? {};
  const title = seo.title?.trim() || input.title;
  const description = seo.description?.trim() || input.description?.trim() || DEFAULT_SEO.description;
  const canonical = safeCanonical(seo.canonicalUrl, absoluteUrl(input.path));
  const imageId = seo.ogImageAssetId ?? input.imageAssetId ?? null;
  const image = imageId ? input.assets?.[imageId] : undefined;
  const imageUrl = image && image.kind === "image" ? absoluteUrl(image.variants.lg ?? image.url) : null;
  const noindex = Boolean(input.noindex || seo.noindex);
  return {
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "website",
      siteName: BRAND.name,
      title,
      description,
      url: canonical,
      ...(imageUrl ? { images: [{ url: imageUrl, alt: image?.alt ?? "" }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description, ...(imageUrl ? { images: [imageUrl] } : {}) },
  };
}

export { htmlToText } from "./text";
