import "server-only";

import { and, eq } from "drizzle-orm";

import type { DrawerData } from "@/components/employer-talent/application-drawer";
import type { OfferFormOptions } from "@/components/employer-talent/offer-forms";
import { SALARY_PERIOD_LABELS } from "@/components/employer/labels";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { SALARY_PERIODS } from "@/db/schema/_constants";
import { env } from "@/lib/env";
import { canAccessFile, getCurrentFileViewer, getFiles, toFileSummary } from "@/modules/files";
import type { FileSummary } from "@/modules/files/types";
import type { OrgContext } from "@/modules/identity/authz";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";

/** Viewer's time zone (profile setting, else the platform default). */
export function viewerTimeZone(ctx: OrgContext<"employer">): string {
  return ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
}

export async function loadOfferFormOptions(): Promise<OfferFormOptions> {
  const [currencies, countries] = await Promise.all([currencyOptions(), countryOptions()]);
  return { currencies, countries, salaryPeriods: SALARY_PERIODS.map((p) => ({ value: p, label: SALARY_PERIOD_LABELS[p] })) };
}

/** The job's advertised pay terms and place (offer defaults), scoped to the caller's organisation. */
export async function loadJobOfferTerms(ctx: OrgContext<"employer">, jobId: string): Promise<NonNullable<DrawerData["jobTerms"]> | undefined> {
  const [row] = await db
    .select({ salaryCurrency: jobs.salaryCurrency, salaryPeriod: jobs.salaryPeriod, countryCode: jobs.countryCode, city: jobs.city })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.organization.id)))
    .limit(1);
  return row;
}

/** File summaries for ids the current viewer may open (others are silently left out). */
export async function accessibleFileSummaries(ids: readonly (string | null | undefined)[]): Promise<Record<string, FileSummary>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return {};
  const [viewer, files] = await Promise.all([getCurrentFileViewer(), getFiles(wanted)]);
  const out: Record<string, FileSummary> = {};
  for (const file of files) {
    if (await canAccessFile(viewer, file)) out[file.id] = toFileSummary(file);
  }
  return out;
}
