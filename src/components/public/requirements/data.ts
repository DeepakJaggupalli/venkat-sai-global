import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { cmsEntries } from "@/db/schema";
import type { RequirementPostData } from "@/modules/content/collections";
import { getPublishedEntries, getPublishedEntryBySlug } from "@/modules/content/queries";
import type { AssetMap, PublishedEntry, PublicMediaAsset } from "@/modules/content/types";
import { listCountries } from "@/modules/taxonomy/queries";

import { settle } from "../server";

/**
 * Data for the requirement posters (CMS collection `requirement_posts`): poster cards for the homepage band,
 * the /requirements listing and the detail page. Only public, consented media is resolved by the content
 * module, so a poster whose image is not public renders without it (and is skipped in grids).
 */

export type PosterTrade = { trade: string; pay: string | null };

export type PosterCard = {
  id: string;
  slug: string;
  href: string;
  title: string;
  summary: string | null;
  countryCode: string | null;
  countryName: string | null;
  companyName: string | null;
  trades: PosterTrade[];
  benefits: string[];
  description: string | null;
  applyBy: string | null;
  publishedAt: Date;
  poster: PublicMediaAsset | null;
  /** Text alternative of the poster image (staff alt text, else built from title and country). */
  alt: string;
};

export const countryNames = cache(async (): Promise<Map<string, string>> => {
  const rows = await settle("countries", () => listCountries(), []);
  return new Map(rows.map((c) => [c.code, c.name]));
});

/** "900 + food allowance 350" + "AED" → "900 + food allowance 350 AED" (currency never assumed). */
export function formatPay(salary: string | undefined | null, currency: string | undefined | null): string | null {
  const s = salary?.trim();
  const c = currency?.trim().toUpperCase();
  if (!s) return null;
  if (!c || s.toUpperCase().includes(c)) return s;
  return `${s} ${c}`;
}

export function toPosterCard(entry: PublishedEntry<"requirement_posts">, assets: AssetMap, names: Map<string, string>): PosterCard {
  const data: RequirementPostData = entry.data;
  const countryName = data.countryCode ? (names.get(data.countryCode) ?? data.countryCode) : null;
  const poster = data.posterAssetId ? (assets[data.posterAssetId] ?? null) : null;
  const trades = (data.trades ?? []).filter((t) => t.trade?.trim()).map((t) => ({ trade: t.trade.trim(), pay: formatPay(t.salary, t.currency) }));
  const alt = poster?.alt?.trim() || `Recruitment poster: ${entry.title}${countryName ? `, ${countryName}` : ""}`;
  return {
    id: entry.id,
    slug: entry.slug,
    href: `/requirements/${entry.slug}`,
    title: entry.title,
    summary: entry.summary,
    countryCode: data.countryCode ?? null,
    countryName,
    companyName: data.companyName?.trim() || null,
    trades,
    benefits: (data.benefits ?? []).map((b) => b.trim()).filter(Boolean),
    description: data.description?.trim() || null,
    applyBy: data.applyBy ?? null,
    publishedAt: entry.publishedAt,
    poster: poster && poster.kind === "image" ? poster : null,
    alt,
  };
}

export type PosterPage = { items: PosterCard[]; total: number; page: number; pageSize: number; pageCount: number };

const EMPTY_PAGE: PosterPage = { items: [], total: 0, page: 1, pageSize: 12, pageCount: 0 };

export async function loadPosterPage(opts: { page?: number; pageSize?: number; country?: string }): Promise<PosterPage> {
  const [result, names] = await Promise.all([
    settle("requirement_posts", () => getPublishedEntries("requirement_posts", { page: opts.page, pageSize: opts.pageSize ?? 12, category: opts.country }), null),
    countryNames(),
  ]);
  if (!result) return EMPTY_PAGE;
  return {
    items: result.items.map((e) => toPosterCard(e, result.assets, names)),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
  };
}

export async function loadPoster(slug: string, preview: string | null): Promise<{ card: PosterCard; seo: PublishedEntry["seo"]; assets: AssetMap; preview: boolean } | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return null;
  const [detail, names] = await Promise.all([settle("requirement_post", () => getPublishedEntryBySlug("requirement_posts", slug, { preview }), null), countryNames()]);
  if (!detail) return null;
  return { card: toPosterCard(detail.entry, detail.assets, names), seo: detail.entry.seo, assets: detail.assets, preview: detail.preview };
}

/** Destination countries that currently have published posters (filter chips on /requirements). */
export async function loadPosterCountries(): Promise<{ code: string; name: string }[]> {
  const [rows, names] = await Promise.all([
    settle(
      "requirement_post_countries",
      () =>
        db
          .selectDistinct({ code: sql<string>`${cmsEntries.data}->>'countryCode'` })
          .from(cmsEntries)
          .where(
            and(
              eq(cmsEntries.collection, "requirement_posts"),
              eq(cmsEntries.status, "published"),
              isNull(cmsEntries.deletedAt),
              sql`${cmsEntries.data}->>'countryCode' is not null`,
              sql`(${cmsEntries.unpublishAt} is null or ${cmsEntries.unpublishAt} > now())`,
            ),
          ),
      [],
    ),
    countryNames(),
  ]);
  return rows
    .filter((r) => /^[A-Z]{2}$/.test(r.code))
    .map((r) => ({ code: r.code, name: names.get(r.code) ?? r.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** WhatsApp group invite link from the CMS site settings (contact group), only when it is an https link. */
export function whatsappGroupUrlFrom(settings: unknown): string | null {
  const contact = (settings as { contact?: { whatsappGroupUrl?: unknown } } | null)?.contact;
  const url = typeof contact?.whatsappGroupUrl === "string" ? contact.whatsappGroupUrl.trim() : "";
  return /^https:\/\/\S+$/i.test(url) ? url : null;
}
