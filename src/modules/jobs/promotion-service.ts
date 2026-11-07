import "server-only";

import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { jobPromotions, jobs, organizations, partnerLicences } from "@/db/schema";
import type { JobInfoSource, JobPromotionType } from "@/db/schema/jobs";
import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import { audit } from "@/modules/audit";
import { checkEntitlement, consumeEntitlement, EntitlementError } from "@/modules/commercial/entitlements";

import { actorAudit, lockJob } from "./access";
import { JOB_LIMITS } from "./constants";
import { canTransition, zonedEndOfDay } from "./lifecycle";
import type { RecruitingAgentInput } from "./schemas";
import type { JobActor, JobPromotionRow, JobRow } from "./types";

/**
 * Featured / boosted / homepage promotions, information-source badges and recruiting-agent
 * transparency. Promotions are always labelled in the UI ("Featured"); employers pay for them with
 * the featured_jobs entitlement, staff grant them with jobs.feature.
 */

const DAY_MS = 86_400_000;

async function activeFeatureEnd(jobId: string, tx: DbOrTx): Promise<Date | null> {
  const [row] = await tx
    .select({ endsAt: sql<Date | null>`max(${jobPromotions.endsAt})` })
    .from(jobPromotions)
    .where(and(eq(jobPromotions.jobId, jobId), eq(jobPromotions.type, "featured"), isNull(jobPromotions.cancelledAt), or(isNull(jobPromotions.endsAt), gt(jobPromotions.endsAt, new Date()))));
  return row?.endsAt ? new Date(row.endsAt) : null;
}

/** Employers feature their own published job for `days` days, using the featured_jobs allowance of their plan. */
export async function promoteJob(actor: JobActor, jobId: string, days: number): Promise<JobPromotionRow> {
  if (actor.kind !== "employer") throw new ActionError("Staff feature jobs from the Command Centre.", { code: "forbidden" });
  if (days < 1 || days > JOB_LIMITS.maxPromotionDays) throw new ActionError(`Choose between 1 and ${JOB_LIMITS.maxPromotionDays} days.`, { fieldErrors: { days: ["Out of range"] } });
  const entitlement = await checkEntitlement(actor.ctx.organization.id, "featured_jobs");
  if (!entitlement.allowed) throw new ActionError(entitlement.reason ?? "Your plan does not include featured jobs.", { code: "entitlement_required" });
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    if (!canTransition("promote", job.status) || (job.publishedAt && job.publishedAt > new Date())) {
      throw new ActionError("Only live jobs can be featured.", { code: "invalid_status" });
    }
    const startsAt = new Date();
    const endsAt = new Date(Math.min(startsAt.getTime() + days * DAY_MS, job.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
    if (endsAt <= startsAt) throw new ActionError("This job's listing ends too soon to feature it.", { code: "expired" });
    const [promotion] = await tx
      .insert(jobPromotions)
      .values({ jobId: job.id, type: "featured", startsAt, endsAt, sourceType: "subscription", createdByUserId: actor.ctx.user.id })
      .returning();
    try {
      await consumeEntitlement(actor.ctx.organization.id, "featured_jobs", { reference: { type: "job_promotion", id: promotion!.id }, actorUserId: actor.ctx.user.id, tx });
    } catch (error) {
      if (error instanceof EntitlementError) throw new ActionError("You have used all featured jobs in your plan.", { code: "entitlement_required" });
      throw error;
    }
    const until = job.featuredUntil && job.featuredUntil > endsAt ? job.featuredUntil : endsAt;
    await tx.update(jobs).set({ isFeatured: true, featuredUntil: until }).where(eq(jobs.id, job.id));
    await audit({ action: "job.promoted", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: { promotionId: promotion!.id, days, endsAt }, ...actorAudit(actor), tx });
    return promotion!;
  });
}

/** Staff (jobs.feature) grant a featured / boosted / homepage window until a date (end of that day). */
export async function featureJob(actor: JobActor, jobId: string, input: { type: JobPromotionType; until: string }): Promise<JobPromotionRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "feature");
    if (job.status !== "published") throw new ActionError("Only published jobs can be promoted.", { code: "invalid_status" });
    const startsAt = new Date();
    const endsAt = zonedEndOfDay(input.until, env().DEFAULT_TIMEZONE);
    if (endsAt <= startsAt) throw new ActionError("Choose an end date in the future.", { fieldErrors: { until: ["Choose a later date"] } });
    if (endsAt.getTime() - startsAt.getTime() > JOB_LIMITS.maxPromotionDays * DAY_MS) {
      throw new ActionError(`Promotions last at most ${JOB_LIMITS.maxPromotionDays} days.`, { fieldErrors: { until: ["Too long"] } });
    }
    const [promotion] = await tx
      .insert(jobPromotions)
      .values({ jobId: job.id, type: input.type, startsAt, endsAt, sourceType: "admin", createdByUserId: actor.ctx.user.id })
      .returning();
    if (input.type === "featured") {
      const until = job.featuredUntil && job.featuredUntil > endsAt ? job.featuredUntil : endsAt;
      await tx.update(jobs).set({ isFeatured: true, featuredUntil: until }).where(eq(jobs.id, job.id));
    }
    await audit({ action: "job.featured", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: { promotionId: promotion!.id, type: input.type, endsAt }, ...actorAudit(actor), tx });
    return promotion!;
  });
}

/** Staff end active promotions of a job (all types, or one type). */
export async function unfeatureJob(actor: JobActor, jobId: string, type?: JobPromotionType): Promise<number> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "feature");
    const cancelled = await tx
      .update(jobPromotions)
      .set({ cancelledAt: new Date() })
      .where(and(eq(jobPromotions.jobId, job.id), isNull(jobPromotions.cancelledAt), type ? eq(jobPromotions.type, type) : undefined))
      .returning({ id: jobPromotions.id });
    if (!type || type === "featured") {
      const remaining = await activeFeatureEnd(job.id, tx);
      await tx.update(jobs).set({ isFeatured: remaining !== null, featuredUntil: remaining }).where(eq(jobs.id, job.id));
    }
    await audit({ action: "job.unfeatured", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: { type: type ?? "all", cancelled: cancelled.length }, ...actorAudit(actor), tx });
    return cancelled.length;
  });
}

/** Staff (jobs.approve) set the information badge: verified by Venkat Sai / supplied by the employer / pending review. */
export async function setJobInfoSource(actor: JobActor, jobId: string, infoSource: JobInfoSource): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "approve");
    const [updated] = await tx.update(jobs).set({ infoSource }).where(eq(jobs.id, job.id)).returning();
    await audit({ action: "job.info_source_changed", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: { from: job.infoSource, to: infoSource }, ...actorAudit(actor), tx });
    return updated!;
  });
}

/**
 * Staff (jobs.approve) record the recruiting agent an overseas job is advertised by or for
 * (regulatory notes rec. 8): a partner's verified, unexpired Indian recruiting-agent licence (name
 * and number copied from it), Venkat Sai's own certificate entered after checking it, or clear.
 */
export async function setJobRecruitingAgent(actor: JobActor, input: RecruitingAgentInput): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, input.id, tx, "approve");
    let values: Partial<typeof jobs.$inferInsert>;
    const today = new Date().toISOString().slice(0, 10);
    if (input.mode === "clear") {
      values = {
        recruitingAgentLicenceId: null,
        recruitingAgentName: null,
        recruitingAgentCertificateNumber: null,
        recruitingAgentCertificateValidUntil: null,
        recruitingAgentVerifiedAt: null,
        recruitingAgentVerifiedByUserId: null,
      };
    } else if (input.mode === "licence") {
      const [licence] = await tx
        .select({ licence: partnerLicences, orgName: organizations.name, orgType: organizations.type })
        .from(partnerLicences)
        .innerJoin(organizations, eq(organizations.id, partnerLicences.organizationId))
        .where(and(eq(partnerLicences.id, input.licenceId!), isNull(partnerLicences.deletedAt)))
        .limit(1);
      if (!licence || licence.orgType !== "recruitment_partner" || licence.licence.licenceType !== "india_recruiting_agent") {
        throw new ActionError("Choose an Indian recruiting-agent licence of a recruitment partner.", { fieldErrors: { licenceId: ["Not a recruiting-agent licence"] } });
      }
      if (licence.licence.verificationStatus !== "verified") throw new ActionError("This licence has not been verified yet.", { fieldErrors: { licenceId: ["Not verified"] } });
      if (licence.licence.validUntil && licence.licence.validUntil < today) throw new ActionError("This licence has expired.", { fieldErrors: { licenceId: ["Expired"] } });
      values = {
        recruitingAgentLicenceId: licence.licence.id,
        recruitingAgentName: licence.orgName,
        recruitingAgentCertificateNumber: licence.licence.licenceNumber,
        recruitingAgentCertificateValidUntil: licence.licence.validUntil,
        recruitingAgentVerifiedAt: new Date(),
        recruitingAgentVerifiedByUserId: actor.ctx.user.id,
      };
    } else {
      if (input.validUntil && input.validUntil < today) throw new ActionError("This certificate has expired.", { fieldErrors: { validUntil: ["Expired"] } });
      values = {
        recruitingAgentLicenceId: null,
        recruitingAgentName: input.name!,
        recruitingAgentCertificateNumber: input.certificateNumber!,
        recruitingAgentCertificateValidUntil: input.validUntil ?? null,
        recruitingAgentVerifiedAt: new Date(),
        recruitingAgentVerifiedByUserId: actor.ctx.user.id,
      };
    }
    const [updated] = await tx.update(jobs).set(values).where(eq(jobs.id, job.id)).returning();
    await audit({
      action: "job.recruiting_agent_set",
      entityType: "job",
      entityId: job.id,
      organizationId: job.organizationId,
      metadata: { mode: input.mode, licenceId: values.recruitingAgentLicenceId ?? null, certificateNumber: values.recruitingAgentCertificateNumber ?? null },
      ...actorAudit(actor),
      tx,
    });
    return updated!;
  });
}

/** End-of-window housekeeping: clear the featured flag of jobs whose featured window ended (background task). */
export async function expireFeaturedFlags(): Promise<number> {
  const rows = await db
    .update(jobs)
    .set({ isFeatured: false, featuredUntil: null })
    .where(and(eq(jobs.isFeatured, true), sql`${jobs.featuredUntil} is not null and ${jobs.featuredUntil} <= now()`))
    .returning({ id: jobs.id });
  return rows.length;
}
