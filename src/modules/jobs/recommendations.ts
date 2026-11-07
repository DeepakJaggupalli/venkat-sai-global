import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { candidateExperience, candidatePreferredLocations, candidateProfiles, candidateSkills, jobLocations, jobs, jobSkills, skills } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { isMinor } from "@/modules/candidates/profile-rules";
import { hasGuardianConsentRecord } from "@/modules/candidates/refs";
import type { CandidateViewer } from "@/modules/candidates/types";
import { staffCan } from "@/modules/identity/authz";

import { loadJobVisibilityFlags, publicJobConditions } from "./filters";
import { hydrateJobCards, selectJobCardRows } from "./present";
import { isRecommendable, scoreJobForCandidate, type RecommendationCandidate, type RecommendationJob } from "./recommendation-scoring";
import type { RecommendedJob } from "./types";

/**
 * "Jobs for you" — explainable rules-based recommendations (recommendation-scoring.ts), never AI.
 * Pool: publicly listed jobs the candidate has not applied to, sharing at least one substantive
 * signal with the profile (preferred or past category, a skill, words of a preferred role) — a
 * location alone never makes a job relevant; overseas jobs only for adults open to overseas work.
 * The newest 300 such jobs are scored; the best are returned with their reasons.
 *
 * Viewer: the candidate themselves (People Portal) or staff with candidates.view + jobs.view.
 */
const POOL_SIZE = 300;

async function loadCandidateSignals(candidateId: string): Promise<{ signals: RecommendationCandidate; userId: string } | null> {
  const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.id, candidateId)).limit(1);
  if (!profile || profile.deletedAt) return null;
  const [skillRows, experienceRows, locationRows, guardian] = await Promise.all([
    db.select({ skillId: candidateSkills.skillId }).from(candidateSkills).where(eq(candidateSkills.candidateId, candidateId)),
    db
      .select({ jobCategoryId: candidateExperience.jobCategoryId })
      .from(candidateExperience)
      .where(and(eq(candidateExperience.candidateId, candidateId), isNotNull(candidateExperience.jobCategoryId))),
    db
      .select({ countryCode: candidatePreferredLocations.countryCode, stateRegion: candidatePreferredLocations.stateRegion, city: candidatePreferredLocations.city })
      .from(candidatePreferredLocations)
      .where(eq(candidatePreferredLocations.candidateId, candidateId))
      .orderBy(asc(candidatePreferredLocations.priority)),
    hasGuardianConsentRecord(profile.userId, db),
  ]);
  const minor = isMinor(profile.dateOfBirth, guardian);
  return {
    userId: profile.userId,
    signals: {
      skillIds: skillRows.map((s) => s.skillId),
      preferredCategoryIds: profile.preferredCategoryIds,
      experienceCategoryIds: [...new Set(experienceRows.map((e) => e.jobCategoryId!))],
      preferredRoles: profile.preferredRoles,
      totalExperienceMonths: profile.totalExperienceMonths,
      desiredEmploymentTypes: profile.desiredEmploymentTypes,
      preferredWorkModes: profile.preferredWorkModes,
      current: { countryCode: profile.currentCountryCode, stateRegion: profile.stateRegion, city: profile.city },
      preferredLocations: locationRows,
      openToOverseas: profile.openToOverseas && !minor,
      willingToRelocate: profile.willingToRelocate,
      expectedSalary:
        profile.expectedSalaryMinor !== null && profile.expectedSalaryCurrency && profile.expectedSalaryPeriod
          ? { amountMinor: profile.expectedSalaryMinor, currency: profile.expectedSalaryCurrency, period: profile.expectedSalaryPeriod }
          : null,
    },
  };
}

function poolConditions(candidateId: string, c: RecommendationCandidate): SQL[] | null {
  const signals: SQL[] = [];
  const categories = [...new Set([...c.preferredCategoryIds, ...c.experienceCategoryIds])];
  if (categories.length) signals.push(inArray(jobs.jobCategoryId, categories));
  if (c.skillIds.length) signals.push(sql`exists (select 1 from job_skills js where js.job_id = ${jobs.id} and js.skill_id in (${sql.join(c.skillIds.map((id) => sql`${id}::uuid`), sql`, `)}))`);
  for (const role of c.preferredRoles.slice(0, 5)) {
    if (role.trim().length >= 3) signals.push(sql`${jobs.title} ilike ${`%${role.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`}`);
  }
  if (!signals.length) return null;
  const conditions: SQL[] = [
    or(...signals)!,
    sql`not exists (select 1 from applications a where a.job_id = ${jobs.id} and a.candidate_id = ${candidateId})`,
  ];
  if (!c.openToOverseas) conditions.push(or(eq(jobs.isOverseas, false), eq(jobs.workMode, "remote"))!);
  return conditions;
}

export async function getRecommendedJobs(candidateId: string, viewer: CandidateViewer, opts: { limit?: number } = {}): Promise<RecommendedJob[]> {
  if (viewer.kind === "self") {
    if (viewer.candidate.id !== candidateId || viewer.candidate.userId !== viewer.user.id) throw new ActionError("Profile not found.", { code: "not_found" });
  } else if (viewer.kind === "staff") {
    if (!staffCan(viewer.ctx, ["candidates.view", "jobs.view"])) throw new ActionError("You do not have permission to see recommendations.", { code: "forbidden" });
  } else {
    throw new ActionError("Recommendations are available to the candidate and Venkat Sai staff only.", { code: "forbidden" });
  }
  const loaded = await loadCandidateSignals(candidateId);
  if (!loaded) return [];
  const pool = poolConditions(candidateId, loaded.signals);
  if (!pool) return [];

  const rows = await selectJobCardRows(and(...publicJobConditions(await loadJobVisibilityFlags()), ...pool), [desc(jobs.publishedAt)], POOL_SIZE);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [skillRows, locationRows] = await Promise.all([
    db
      .select({ jobId: jobSkills.jobId, id: jobSkills.skillId, name: skills.name, isRequired: jobSkills.isRequired })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(inArray(jobSkills.jobId, ids)),
    db
      .select({ jobId: jobLocations.jobId, countryCode: jobLocations.countryCode, stateRegion: jobLocations.stateRegion, city: jobLocations.city })
      .from(jobLocations)
      .where(inArray(jobLocations.jobId, ids)),
  ]);
  const group = <T extends { jobId: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of list) map.set(item.jobId, [...(map.get(item.jobId) ?? []), item]);
    return map;
  };
  const skillsByJob = group(skillRows);
  const locationsByJob = group(locationRows);

  const scored = rows
    .map((row) => {
      const job: RecommendationJob = {
        title: row.title,
        jobCategoryId: row.jobCategoryId,
        categoryName: row.categoryName,
        skills: skillsByJob.get(row.id) ?? [],
        employmentType: row.employmentType,
        workMode: row.workMode,
        primary: { countryCode: row.countryCode, stateRegion: row.stateRegion, city: row.city },
        extraLocations: locationsByJob.get(row.id) ?? [],
        isOverseas: row.isOverseas,
        experienceMinYears: row.experienceMinYears,
        experienceMaxYears: row.experienceMaxYears,
        salary: row.salaryVisible && row.salaryCurrency && row.salaryPeriod ? { minMinor: row.salaryMinMinor, maxMinor: row.salaryMaxMinor, currency: row.salaryCurrency, period: row.salaryPeriod } : null,
      };
      return { row, result: scoreJobForCandidate(loaded.signals, job) };
    })
    .filter(({ result }) => isRecommendable(result))
    .sort((a, b) => b.result.score - a.result.score || (b.row.publishedAt?.getTime() ?? 0) - (a.row.publishedAt?.getTime() ?? 0))
    .slice(0, Math.min(Math.max(opts.limit ?? 10, 1), 50));

  const cards = await hydrateJobCards(
    scored.map((s) => s.row),
    { kind: "talent", userId: loaded.userId, candidateId },
  );
  return scored.map((s, index) => ({ job: cards[index]!, score: s.result.score, reasons: s.result.reasons }));
}
