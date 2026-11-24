import "server-only";

import { and, count, desc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { countries, workerReviews } from "@/db/schema";

/**
 * Public reads: only reviews staff approved AND the worker allowed us to show. Never the CV submission, the worker's
 * full name, phone or anything else: just what the worker chose to show.
 */

const PUBLIC = and(eq(workerReviews.status, "approved"), eq(workerReviews.consentToPublish, true));

export type PublicWorkerReview = {
  id: string;
  displayName: string;
  trade: string;
  countryCode: string | null;
  countryName: string | null;
  rating: number;
  body: string;
  /** When the worker wrote it (the card shows month and year). */
  writtenAt: Date;
};

/** Approved, consented reviews, newest published first (1 to 48). Deduplicated per request. */
export const listPublicWorkerReviews = cache(async (limit: number): Promise<PublicWorkerReview[]> => {
  const size = Math.min(Math.max(Math.trunc(limit) || 1, 1), 48);
  const rows = await db
    .select({
      id: workerReviews.id,
      displayName: workerReviews.displayName,
      trade: workerReviews.trade,
      countryCode: workerReviews.countryCode,
      countryName: countries.name,
      rating: workerReviews.rating,
      body: workerReviews.body,
      createdAt: workerReviews.createdAt,
    })
    .from(workerReviews)
    .leftJoin(countries, eq(countries.code, workerReviews.countryCode))
    .where(PUBLIC)
    .orderBy(desc(workerReviews.publishedAt), desc(workerReviews.createdAt))
    .limit(size);
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    trade: r.trade,
    countryCode: r.countryCode ?? null,
    countryName: r.countryName ?? null,
    rating: r.rating,
    body: r.body,
    writtenAt: r.createdAt,
  }));
});

/** How many reviews are on the website (to decide whether to show the section at all). */
export const countPublicWorkerReviews = cache(async (): Promise<number> => {
  const [row] = await db.select({ value: count() }).from(workerReviews).where(PUBLIC);
  return row?.value ?? 0;
});
