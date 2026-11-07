import "server-only";

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { applications, candidatePrivacySettings, candidateProfiles, countries, jobs, profileUnlocks, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { toMinorUnits } from "@/lib/format";
import { paginated } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { orgCan, staffCan } from "@/modules/identity/authz";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

import { CANDIDATE_VERIFICATION_LEVEL_OPTIONS } from "./constants";
import { candidateIsMinorSql, restrictedMinorSql } from "./minor-sql";
import { INACTIVE_ORG_STATUSES, maskedName } from "./policy";
import { escapeLike, toPrefixTsQuery, VERIFICATION_LEVEL_RANK } from "./profile-rules";
import type { CandidateSearchFilters } from "./schemas";
import type { CandidateCard, CandidateSearchResult, CandidateViewer } from "./types";

/**
 * Candidate discovery for employers and Venkat Sai staff (full-text + filters), returning masked
 * cards. The visibility rules mirror policy.ts `isDiscoverableByEmployer`:
 *  - employers: open to work, visibility public_to_employers (or verified_employers when the
 *    organisation is verified), the organisation not blocked by the candidate, active account;
 *    gated by employer.candidates.search, the employer.candidate_search flag and the
 *    candidate_search entitlement; rate limited against scraping.
 *  - staff (candidates.view): every non-hidden profile; hidden ones only with includeHidden +
 *    candidates.manage (record management, not sourcing).
 * Cards never carry contact details, photos (reduces appearance-based screening) or identity data.
 * Searches for overseas roles (or by a foreign employer) exclude minors, and employers never find a
 * minor without granted guardian consent (DPDP Rules 2025 — regulatory notes rec. 21).
 */

const PROFICIENCY_RANK = sql`case cl.proficiency when 'basic' then 1 when 'conversational' then 2 when 'fluent' then 3 when 'native' then 4 else 0 end`;
const PROFICIENCY_ORDER = { basic: 1, conversational: 2, fluent: 3, native: 4 } as const;
const EMPLOYER_SEARCHES_PER_HOUR = 300;

/** SQL: the candidate's latest share_assessment_results consent is granted. */
const assessmentConsentSql: SQL = sql`coalesce((
  select cr.granted from consent_records cr
  where cr.user_id = ${candidateProfiles.userId} and cr.purpose = 'share_assessment_results'
  order by cr.created_at desc limit 1), false)`;

const passedAssessmentSql: SQL = sql`exists (
  select 1 from skill_assessments sa
  where sa.candidate_id = ${candidateProfiles.id} and sa.status = 'completed' and sa.result = 'pass' and sa.result_published_at is not null)`;

type SearchContext =
  | { kind: "employer"; organizationId: string; organizationVerified: boolean; overseasEmployer: boolean }
  | { kind: "staff"; includeHidden: boolean };

async function authorise(viewer: CandidateViewer, filters: CandidateSearchFilters): Promise<SearchContext> {
  if (viewer.kind === "staff") {
    if (!staffCan(viewer.ctx, "candidates.view")) throw new ActionError("You do not have permission to search candidates.", { code: "forbidden" });
    return { kind: "staff", includeHidden: filters.includeHidden && staffCan(viewer.ctx, "candidates.manage") };
  }
  if (viewer.kind === "employer") {
    const { ctx } = viewer;
    if (!orgCan(ctx, "employer.candidates.search")) throw new ActionError("You do not have permission to search candidates.", { code: "forbidden" });
    if (INACTIVE_ORG_STATUSES.includes(ctx.organization.status)) {
      throw new ActionError("Candidate search is not available while your organisation is suspended or not approved.", { code: "organization_inactive" });
    }
    if (!(await isFeatureEnabled("employer.candidate_search", { portal: "employer", organizationId: ctx.organization.id }))) {
      throw new ActionError("Candidate search is not available at the moment.", { code: "feature_disabled" });
    }
    const entitlement = await checkEntitlement(ctx.organization.id, "candidate_search");
    if (!entitlement.allowed) {
      throw new ActionError(entitlement.reason ?? "Your current plan does not include candidate search.", { code: "entitlement_required" });
    }
    const limit = await rateLimit(`candidate-search:${ctx.organization.id}:${ctx.user.id}`, EMPLOYER_SEARCHES_PER_HOUR, 60 * 60);
    if (!limit.allowed) throw new ActionError("You have run many searches in a short time. Please try again later.", { code: "rate_limited" });
    const homeCountry = await getSetting("platform.home_country");
    return {
      kind: "employer",
      organizationId: ctx.organization.id,
      organizationVerified: ctx.organization.status === "verified",
      // A foreign employer is always hiring for overseas employment.
      overseasEmployer: Boolean(ctx.organization.countryCode && ctx.organization.countryCode !== homeCountry),
    };
  }
  throw new ActionError("Candidate search is available to employers and Venkat Sai staff only.", { code: "forbidden" });
}

function buildConditions(filters: CandidateSearchFilters, ctx: SearchContext, tsQuery: string | null): SQL[] {
  const c: SQL[] = [isNull(candidateProfiles.deletedAt), eq(users.status, "active")];
  const cp = candidateProfiles;

  if (ctx.kind === "employer") {
    c.push(eq(cp.isOpenToWork, true));
    c.push(ctx.organizationVerified ? inArray(cp.visibility, ["public_to_employers", "verified_employers"]) : eq(cp.visibility, "public_to_employers"));
    c.push(sql`not (${ctx.organizationId}::uuid = any(coalesce(${candidatePrivacySettings.blockedOrganizationIds}, '{}'::uuid[])))`);
    c.push(sql`not ${restrictedMinorSql}`);
  } else if (!ctx.includeHidden) {
    c.push(ne(cp.visibility, "hidden"));
  }

  if (tsQuery) c.push(sql`${cp.searchVector} @@ to_tsquery('simple', ${tsQuery})`);

  if (filters.skillIds.length) {
    const ids = sql.join(
      filters.skillIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const verified = filters.verifiedSkillsOnly ? sql` and cs.verified` : sql``;
    c.push(
      filters.skillMatch === "all"
        ? sql`(select count(distinct cs.skill_id) from candidate_skills cs where cs.candidate_id = ${cp.id} and cs.skill_id in (${ids})${verified}) = ${filters.skillIds.length}`
        : sql`exists (select 1 from candidate_skills cs where cs.candidate_id = ${cp.id} and cs.skill_id in (${ids})${verified})`,
    );
  } else if (filters.verifiedSkillsOnly) {
    c.push(sql`exists (select 1 from candidate_skills cs where cs.candidate_id = ${cp.id} and cs.verified)`);
  }

  if (filters.experienceMinYears !== undefined) c.push(gte(cp.totalExperienceMonths, filters.experienceMinYears * 12));
  if (filters.experienceMaxYears !== undefined) c.push(sql`${cp.totalExperienceMonths} < ${(filters.experienceMaxYears + 1) * 12}`);

  if (filters.countryCode) c.push(eq(cp.currentCountryCode, filters.countryCode));
  if (filters.stateRegion) c.push(sql`${cp.stateRegion} ilike ${`%${escapeLike(filters.stateRegion)}%`}`);
  if (filters.city) c.push(sql`${cp.city} ilike ${`%${escapeLike(filters.city)}%`}`);
  if (filters.preferredCountryCode) {
    c.push(sql`exists (select 1 from candidate_preferred_locations pl where pl.candidate_id = ${cp.id} and pl.country_code = ${filters.preferredCountryCode})`);
  }
  if (filters.availability.length) c.push(inArray(cp.availability, filters.availability));

  for (const code of filters.languageCodes) {
    const min = filters.minLanguageProficiency ? PROFICIENCY_ORDER[filters.minLanguageProficiency] : 0;
    c.push(sql`exists (select 1 from candidate_languages cl where cl.candidate_id = ${cp.id} and cl.language_code = ${code} and ${PROFICIENCY_RANK} >= ${min})`);
  }

  if (filters.educationLevelId) {
    c.push(sql`exists (
      select 1 from candidate_education ce join education_levels el on el.id = ce.education_level_id
      where ce.candidate_id = ${cp.id}
        and el.rank >= (select min_el.rank from education_levels min_el where min_el.id = ${filters.educationLevelId}::uuid))`);
  }
  if (filters.verifiedCredentialsOnly) {
    c.push(sql`exists (select 1 from candidate_credentials cc where cc.candidate_id = ${cp.id} and cc.deleted_at is null and cc.verification_status = 'verified')`);
  }
  if (filters.assessedOnly) {
    c.push(passedAssessmentSql);
    // Organisations only learn about assessment results the candidate agreed to share.
    if (ctx.kind === "employer") c.push(assessmentConsentSql);
  }

  if (filters.employmentTypes.length) c.push(sql`${cp.desiredEmploymentTypes} && ${toTextArray(filters.employmentTypes)}`);
  if (filters.workModes.length) c.push(sql`${cp.preferredWorkModes} && ${toTextArray(filters.workModes)}`);
  if (filters.openToOverseas) c.push(eq(cp.openToOverseas, true));
  if (filters.passportValid) {
    c.push(eq(cp.passportStatus, "valid"));
    c.push(or(isNull(cp.passportExpiry), sql`${cp.passportExpiry} > current_date`)!);
  }
  if (filters.openToOverseas || filters.forOverseasRole || (ctx.kind === "employer" && ctx.overseasEmployer)) {
    c.push(sql`not ${candidateIsMinorSql}`);
  }

  if (filters.salaryMax !== undefined && filters.salaryCurrency && filters.salaryPeriod) {
    const maxMinor = toMinorUnits(filters.salaryMax, filters.salaryCurrency);
    // No currency conversion: expectations in another currency or period are not comparable and are left out.
    c.push(
      or(
        isNull(cp.expectedSalaryMinor),
        and(eq(cp.expectedSalaryCurrency, filters.salaryCurrency), eq(cp.expectedSalaryPeriod, filters.salaryPeriod), lte(cp.expectedSalaryMinor, maxMinor)),
      )!,
    );
  }
  if (filters.minVerificationLevel) {
    const min = VERIFICATION_LEVEL_RANK[filters.minVerificationLevel];
    c.push(inArray(cp.verificationLevel, CANDIDATE_VERIFICATION_LEVEL_OPTIONS.filter((l) => VERIFICATION_LEVEL_RANK[l] >= min)));
  }
  if (filters.activeWithinDays) c.push(sql`${cp.lastActiveAt} >= now() - make_interval(days => ${filters.activeWithinDays})`);
  return c;
}

function toTextArray(values: readonly string[]): SQL {
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/** Search candidates as an employer (OrgContext) or staff (StaffContext) viewer. */
export async function searchCandidates(filters: CandidateSearchFilters, viewer: CandidateViewer): Promise<CandidateSearchResult> {
  const ctx = await authorise(viewer, filters);
  const tsQuery = toPrefixTsQuery(filters.q);
  const where = and(...buildConditions(filters, ctx, tsQuery));
  const cp = candidateProfiles;
  const rank = tsQuery ? sql<number>`ts_rank_cd(${cp.searchVector}, to_tsquery('simple', ${tsQuery}))` : sql<number>`0`;
  const verificationRank = sql`case ${cp.verificationLevel} when 'skills_assessed' then 3 when 'documents_verified' then 2 when 'basic' then 1 else 0 end`;

  const order = (() => {
    switch (filters.sort) {
      case "recent":
        return [sql`${cp.lastActiveAt} desc nulls last`, desc(cp.profileCompleteness)];
      case "experience":
        return [sql`${cp.totalExperienceMonths} desc nulls last`, sql`${cp.lastActiveAt} desc nulls last`];
      case "completeness":
        return [desc(cp.profileCompleteness), sql`${cp.lastActiveAt} desc nulls last`];
      default:
        return tsQuery
          ? [sql`${rank} desc`, sql`${cp.lastActiveAt} desc nulls last`]
          : [sql`${verificationRank} desc`, desc(cp.profileCompleteness), sql`${cp.lastActiveAt} desc nulls last`];
    }
  })();

  const employerView = ctx.kind === "employer";
  const offset = (filters.page - 1) * filters.pageSize;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: cp.id,
        displayName: users.displayName,
        showFullName: candidatePrivacySettings.showFullNameToEmployers,
        headline: cp.headline,
        currentJobTitle: cp.currentJobTitle,
        experienceLevel: cp.experienceLevel,
        totalExperienceMonths: cp.totalExperienceMonths,
        countryCode: cp.currentCountryCode,
        countryName: countries.name,
        stateRegion: cp.stateRegion,
        city: cp.city,
        skills: cp.skillNamesCache,
        availability: cp.availability,
        openToOverseas: cp.openToOverseas,
        isMinor: sql<boolean>`${candidateIsMinorSql}`,
        passportStatus: cp.passportStatus,
        verificationLevel: cp.verificationLevel,
        expectedSalaryMinor: cp.expectedSalaryMinor,
        expectedSalaryCurrency: cp.expectedSalaryCurrency,
        expectedSalaryPeriod: cp.expectedSalaryPeriod,
        lastActiveAt: cp.lastActiveAt,
        profileCompleteness: cp.profileCompleteness,
        visibility: cp.visibility,
        rank,
        verifiedCredentialCount: sql<number>`(select count(*)::int from candidate_credentials cc where cc.candidate_id = ${cp.id} and cc.deleted_at is null and cc.verification_status = 'verified')`,
        passedAssessmentCount: employerView
          ? sql<number>`case when ${assessmentConsentSql} then (select count(*)::int from skill_assessments sa where sa.candidate_id = ${cp.id} and sa.status = 'completed' and sa.result = 'pass' and sa.result_published_at is not null) else 0 end`
          : sql<number>`(select count(*)::int from skill_assessments sa where sa.candidate_id = ${cp.id} and sa.status = 'completed' and sa.result = 'pass' and sa.result_published_at is not null)`,
        languages: sql<string[]>`coalesce((select array_agg(l.name order by l.name) from candidate_languages cl join languages l on l.code = cl.language_code where cl.candidate_id = ${cp.id}), '{}'::text[])`,
      })
      .from(cp)
      .innerJoin(users, eq(users.id, cp.userId))
      .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, cp.id))
      .leftJoin(countries, eq(countries.code, cp.currentCountryCode))
      .where(where)
      .orderBy(...order, asc(cp.id))
      .limit(filters.pageSize)
      .offset(offset),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(cp)
      .innerJoin(users, eq(users.id, cp.userId))
      .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, cp.id))
      .where(where),
  ]);

  const relationships = ctx.kind === "employer" ? await employerRelationships(ctx.organizationId, rows.map((r) => r.id)) : null;
  const items: CandidateCard[] = rows.map((r) => {
    const nameVisible = ctx.kind === "staff" || r.showFullName === true || Boolean(relationships?.applied.has(r.id) || relationships?.unlocked.has(r.id));
    return {
      candidateId: r.id,
      displayName: nameVisible ? r.displayName : maskedName(r.displayName),
      nameMasked: !nameVisible,
      headline: r.headline,
      currentJobTitle: r.currentJobTitle,
      experienceLevel: r.experienceLevel,
      totalExperienceMonths: r.totalExperienceMonths,
      location: { countryCode: r.countryCode, countryName: r.countryName, stateRegion: r.stateRegion, city: r.city },
      skills: r.skills.slice(0, 12),
      availability: r.availability,
      openToOverseas: r.openToOverseas && !r.isMinor,
      passportStatus: r.passportStatus,
      verificationLevel: r.verificationLevel,
      verifiedCredentialCount: Number(r.verifiedCredentialCount ?? 0),
      passedAssessmentCount: Number(r.passedAssessmentCount ?? 0),
      languages: r.languages ?? [],
      expectedSalary:
        r.expectedSalaryMinor !== null && r.expectedSalaryCurrency && r.expectedSalaryPeriod
          ? { amountMinor: r.expectedSalaryMinor, currency: r.expectedSalaryCurrency, period: r.expectedSalaryPeriod }
          : null,
      lastActiveAt: r.lastActiveAt,
      profileCompleteness: r.profileCompleteness,
      relationship: { applied: relationships?.applied.has(r.id) ?? false, unlocked: relationships?.unlocked.has(r.id) ?? false },
      visibility: ctx.kind === "staff" ? r.visibility : null,
      rank: tsQuery ? Number(r.rank) : null,
    };
  });
  return paginated(items, Number(totals[0]?.value ?? 0), { page: filters.page, pageSize: filters.pageSize });
}

/** Which of these candidates applied to (and shared with) the organisation, or are unlocked by it. */
async function employerRelationships(organizationId: string, candidateIds: string[]): Promise<{ applied: Set<string>; unlocked: Set<string> }> {
  if (!candidateIds.length) return { applied: new Set(), unlocked: new Set() };
  const [applied, unlocked] = await Promise.all([
    db
      .selectDistinct({ candidateId: applications.candidateId })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          inArray(applications.candidateId, candidateIds),
          eq(jobs.organizationId, organizationId),
          isNotNull(applications.consentToShareAt),
          isNotNull(applications.sharedWithEmployerAt),
          ne(applications.status, "withdrawn"),
        ),
      ),
    db
      .select({ candidateId: profileUnlocks.candidateId })
      .from(profileUnlocks)
      .where(
        and(
          eq(profileUnlocks.organizationId, organizationId),
          inArray(profileUnlocks.candidateId, candidateIds),
          isNull(profileUnlocks.revokedAt),
          or(isNull(profileUnlocks.expiresAt), sql`${profileUnlocks.expiresAt} > now()`),
        ),
      ),
  ]);
  return { applied: new Set(applied.map((r) => r.candidateId)), unlocked: new Set(unlocked.map((r) => r.candidateId)) };
}
