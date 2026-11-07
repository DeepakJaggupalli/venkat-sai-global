import "server-only";

import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  candidateAttributions,
  candidatePrivacySettings,
  candidateProfiles,
  consentRecords,
  jobs,
  mobilisationChecklistItems,
  mobilisationRecords,
  partnerSubmissions,
  placements,
  users,
  type CandidateAttributionStatus,
  type MobilisationStatus,
} from "@/db/schema";
import { maskEmail, maskPhone } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { OrgContext } from "@/modules/identity/authz";

/**
 * Partner Portal read models the recruitment module does not expose yet (reported as cross-module
 * needs). Every query is scoped to the caller's partner organisation; nothing here returns another
 * partner's data, Venkat Sai finances or unmasked contact details.
 */

type PartnerCtx = OrgContext<"recruitment_partner">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

function assertPermission(ctx: PartnerCtx, permission: string): void {
  if (!ctx.permissions.has(permission)) throw new Error("forbidden");
}

function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, "").trim()}%`;
}

// ---------------------------------------------------------------------------
// Partner-sourced candidate pool
// ---------------------------------------------------------------------------

export type ConsentState = "recorded" | "withdrawn" | "partner_submissions_off" | "none";

export type PartnerCandidateItem = {
  id: string;
  displayName: string;
  headline: string | null;
  city: string | null;
  countryCode: string | null;
  verificationLevel: string;
  /** The partner created or first sourced this profile (contact details may be revealed, logged). */
  sourcedByUs: boolean;
  /** Masked contact, only for candidates the partner sourced. */
  maskedEmail: string | null;
  maskedPhone: string | null;
  submissions: number;
  lastSubmittedAt: Date | null;
  consent: { state: ConsentState; recordedAt: Date | null };
  attribution: { status: CandidateAttributionStatus; expiresAt: Date | null } | null;
};

function poolCondition(orgId: string): SQL {
  return or(
    eq(candidateProfiles.sourcedByPartnerOrgId, orgId),
    exists(
      db
        .select({ one: sql`1` })
        .from(partnerSubmissions)
        .where(and(eq(partnerSubmissions.candidateId, candidateProfiles.id), eq(partnerSubmissions.partnerOrganizationId, orgId))),
    ),
  )!;
}

export type CandidatePoolFilters = { q?: string; show?: "attributed" | "sourced" };

/**
 * Candidates the partner sourced or submitted before (the only people it may submit again), with
 * consent and attribution status. partner.candidates.submit.
 */
export async function listPartnerCandidates(ctx: PartnerCtx, filters: CandidatePoolFilters, page: PageQuery): Promise<Paginated<PartnerCandidateItem>> {
  assertPermission(ctx, "partner.candidates.submit");
  const orgId = ctx.organization.id;
  const conditions: SQL[] = [poolCondition(orgId), isNull(candidateProfiles.deletedAt)];
  if (filters.q && filters.q.trim().length >= 2) conditions.push(ilike(users.displayName, likePattern(filters.q)));
  if (filters.show === "sourced") conditions.push(eq(candidateProfiles.sourcedByPartnerOrgId, orgId));
  if (filters.show === "attributed") {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(candidateAttributions)
          .where(and(eq(candidateAttributions.candidateId, candidateProfiles.id), eq(candidateAttributions.partnerOrganizationId, orgId), eq(candidateAttributions.status, "active"))),
      ),
    );
  }
  const where = and(...conditions);

  const lastConsentAt = sql<Date | null>`(select max(${consentRecords.createdAt}) from ${consentRecords} where ${consentRecords.userId} = ${candidateProfiles.userId} and ${consentRecords.purpose} = 'partner_submission' and ${consentRecords.granted} and ${consentRecords.evidence}->>'partnerOrganizationId' = ${orgId})`;
  const lastWithdrawnAt = sql<Date | null>`(select max(${consentRecords.createdAt}) from ${consentRecords} where ${consentRecords.userId} = ${candidateProfiles.userId} and ${consentRecords.purpose} = 'partner_submission' and not ${consentRecords.granted})`;
  const submissionCount = sql<number>`(select count(*)::int from ${partnerSubmissions} where ${partnerSubmissions.candidateId} = ${candidateProfiles.id} and ${partnerSubmissions.partnerOrganizationId} = ${orgId})`;
  const lastSubmittedAt = sql<Date | null>`(select max(${partnerSubmissions.createdAt}) from ${partnerSubmissions} where ${partnerSubmissions.candidateId} = ${candidateProfiles.id} and ${partnerSubmissions.partnerOrganizationId} = ${orgId})`;

  const [rows, total] = await Promise.all([
    db
      .select({
        id: candidateProfiles.id,
        displayName: users.displayName,
        email: users.email,
        phone: users.phone,
        headline: candidateProfiles.headline,
        currentJobTitle: candidateProfiles.currentJobTitle,
        city: candidateProfiles.city,
        countryCode: candidateProfiles.currentCountryCode,
        verificationLevel: candidateProfiles.verificationLevel,
        sourcedBy: candidateProfiles.sourcedByPartnerOrgId,
        allowPartnerSubmissions: candidatePrivacySettings.allowPartnerSubmissions,
        lastConsentAt,
        lastWithdrawnAt,
        submissionCount,
        lastSubmittedAt,
      })
      .from(candidateProfiles)
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
      .where(where)
      .orderBy(desc(lastSubmittedAt), asc(users.displayName))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(candidateProfiles).innerJoin(users, eq(users.id, candidateProfiles.userId)).where(where),
  ]);

  const ids = rows.map((r) => r.id);
  const attributions = ids.length
    ? await db
        .select({ candidateId: candidateAttributions.candidateId, status: candidateAttributions.status, expiresAt: candidateAttributions.expiresAt, firstSubmittedAt: candidateAttributions.firstSubmittedAt })
        .from(candidateAttributions)
        .where(and(inArray(candidateAttributions.candidateId, ids), eq(candidateAttributions.partnerOrganizationId, orgId)))
        .orderBy(desc(candidateAttributions.firstSubmittedAt))
    : [];
  const latestAttribution = new Map<string, { status: CandidateAttributionStatus; expiresAt: Date | null }>();
  for (const a of attributions) if (!latestAttribution.has(a.candidateId)) latestAttribution.set(a.candidateId, { status: a.status, expiresAt: a.expiresAt });

  const items = rows.map((r): PartnerCandidateItem => {
    const sourcedByUs = r.sourcedBy === orgId;
    const consentAt = r.lastConsentAt ? new Date(r.lastConsentAt) : null;
    const withdrawnAt = r.lastWithdrawnAt ? new Date(r.lastWithdrawnAt) : null;
    let state: ConsentState = "none";
    if (consentAt) state = withdrawnAt && withdrawnAt > consentAt ? "withdrawn" : "recorded";
    if (state === "recorded" && r.allowPartnerSubmissions === false) state = "partner_submissions_off";
    return {
      id: r.id,
      displayName: r.displayName,
      headline: r.headline ?? r.currentJobTitle,
      city: r.city,
      countryCode: r.countryCode,
      verificationLevel: r.verificationLevel,
      sourcedByUs,
      maskedEmail: sourcedByUs && r.email ? maskEmail(r.email) : null,
      maskedPhone: sourcedByUs && r.phone ? maskPhone(r.phone) : null,
      submissions: Number(r.submissionCount ?? 0),
      lastSubmittedAt: r.lastSubmittedAt ? new Date(r.lastSubmittedAt) : null,
      consent: { state, recordedAt: consentAt },
      attribution: latestAttribution.get(r.id) ?? null,
    };
  });
  return paginated(items, total[0]?.value ?? 0, page);
}

/** Options for "submit a candidate you sourced before" (name + headline only), excluding people already submitted for the assignment. */
export async function listSubmittableCandidates(ctx: PartnerCtx, assignmentId: string): Promise<{ id: string; displayName: string; headline: string | null }[]> {
  assertPermission(ctx, "partner.candidates.submit");
  const orgId = ctx.organization.id;
  const already = isUuid(assignmentId)
    ? db.select({ id: partnerSubmissions.candidateId }).from(partnerSubmissions).where(and(eq(partnerSubmissions.assignmentId, assignmentId), eq(partnerSubmissions.partnerOrganizationId, orgId), sql`${partnerSubmissions.status} <> 'withdrawn'`))
    : null;
  const rows = await db
    .select({ id: candidateProfiles.id, displayName: users.displayName, headline: candidateProfiles.headline, currentJobTitle: candidateProfiles.currentJobTitle })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(poolCondition(orgId), isNull(candidateProfiles.deletedAt), already ? notInArray(candidateProfiles.id, already) : undefined))
    .orderBy(asc(users.displayName))
    .limit(500);
  return rows.map((r) => ({ id: r.id, displayName: r.displayName, headline: r.headline ?? r.currentJobTitle }));
}

/** Contact detail of a candidate the partner sourced, for a logged reveal. Returns null when not entitled. */
export async function getSourcedCandidateContact(ctx: PartnerCtx, candidateId: string): Promise<{ userId: string; email: string | null; phone: string | null } | null> {
  assertPermission(ctx, "partner.candidates.submit");
  if (!isUuid(candidateId)) return null;
  const [row] = await db
    .select({ userId: users.id, email: users.email, phone: users.phone })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(eq(candidateProfiles.id, candidateId), eq(candidateProfiles.sourcedByPartnerOrgId, ctx.organization.id), isNull(candidateProfiles.deletedAt)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Document requests (mobilisation of placements credited to the partner)
// ---------------------------------------------------------------------------

export type PartnerMobilisationItem = {
  id: string;
  code: string;
  status: MobilisationStatus;
  placementId: string;
  candidateName: string;
  jobTitle: string;
  destinationCountryCode: string;
  travelDate: string | null;
  /** Required items still open that the partner or candidate is responsible for. */
  openItems: number;
  rejectedItems: number;
};

export async function listPartnerMobilisations(ctx: PartnerCtx, opts: { openOnly?: boolean } = {}): Promise<PartnerMobilisationItem[]> {
  if (!ctx.permissions.has("partner.documents.manage") && !ctx.permissions.has("partner.submissions.view")) throw new Error("forbidden");
  const openItems = sql<number>`(select count(*)::int from ${mobilisationChecklistItems} where ${mobilisationChecklistItems.mobilisationId} = ${mobilisationRecords.id} and ${mobilisationChecklistItems.responsibleParty} in ('partner', 'candidate') and ${mobilisationChecklistItems.status} in ('pending', 'rejected'))`;
  const rejectedItems = sql<number>`(select count(*)::int from ${mobilisationChecklistItems} where ${mobilisationChecklistItems.mobilisationId} = ${mobilisationRecords.id} and ${mobilisationChecklistItems.status} = 'rejected')`;
  const rows = await db
    .select({
      id: mobilisationRecords.id,
      code: mobilisationRecords.code,
      status: mobilisationRecords.status,
      placementId: placements.id,
      candidateName: users.displayName,
      jobTitle: jobs.title,
      destinationCountryCode: mobilisationRecords.destinationCountryCode,
      travelDate: mobilisationRecords.travelDate,
      openItems,
      rejectedItems,
    })
    .from(mobilisationRecords)
    .innerJoin(placements, eq(placements.id, mobilisationRecords.placementId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, placements.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .innerJoin(jobs, eq(jobs.id, placements.jobId))
    .where(and(eq(placements.partnerOrganizationId, ctx.organization.id), opts.openOnly ? notInArray(mobilisationRecords.status, ["completed", "cancelled"]) : undefined))
    .orderBy(desc(openItems), asc(mobilisationRecords.travelDate))
    .limit(200);
  return rows.map((r) => ({ ...r, openItems: Number(r.openItems ?? 0), rejectedItems: Number(r.rejectedItems ?? 0) }));
}
