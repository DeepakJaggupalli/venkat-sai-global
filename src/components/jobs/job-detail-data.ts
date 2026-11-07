import "server-only";

import { headers } from "next/headers";

import { env } from "@/lib/env";
import { absoluteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getPublicJobBySlug } from "@/modules/jobs/queries";
import { buildJobPostingJsonLd, serializeJsonLd } from "@/modules/jobs/structured-data";
import type { PublicJobDetail } from "@/modules/jobs/types";
import { recordJobView } from "@/modules/jobs/views";
import { BRAND } from "@/config/site";

import type { JobApplyCta } from "./job-detail";

/** Where "Apply" leads for this viewer (never a payment step; external jobs open the employer's site). */
export function applyCtaFor(job: PublicJobDetail, signedIn: boolean): JobApplyCta {
  if (job.hasApplied) return { kind: "applied", href: "/talent/applications" };
  if (job.displayStatus !== "published") return { kind: "closed" };
  if (job.applyMode === "external_url") return job.externalApplyUrl ? { kind: "external", url: job.externalApplyUrl } : { kind: "closed" };
  return { kind: "platform", href: `/talent/apply/${job.id}`, signedIn };
}

/** Load a publicly listed job for a detail page and count the view (best effort, never blocks the page). */
export async function loadJobDetail(slug: string, viewer: { userId?: string | null; candidateId?: string | null }): Promise<PublicJobDetail | null> {
  const job = await getPublicJobBySlug(decodeURIComponent(slug), viewer);
  if (!job) return null;
  try {
    await recordJobView(job.id, { userId: viewer.userId ?? null });
  } catch (error) {
    logger.warn("Failed to record job view", { error });
  }
  return job;
}

/** schema.org JobPosting markup for the public page (published, unexpired jobs only — guaranteed by the query). */
export async function jobPostingScript(job: PublicJobDetail): Promise<{ json: string; nonce: string | undefined }> {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return { json: serializeJsonLd(buildJobPostingJsonLd(job, { url: absoluteUrl(`/jobs/${job.slug}`), siteName: BRAND.name })), nonce };
}

/** The viewer's time zone for dates on job pages. */
export function viewerTimeZone(user: { timezone: string | null } | null): string {
  return user?.timezone ?? env().DEFAULT_TIMEZONE;
}
