/**
 * Rules-based skill gap analysis (client-safe, pure, explainable — no AI). Compares the
 * candidate's skills with the skills most often listed on published jobs in their preferred
 * categories, then suggests published courses that teach the missing ones.
 */

export type SkillDemand = { skillId: string; name: string; jobCount: number };
export type CourseOffer = { id: string; slug: string; title: string; skillIds: readonly string[] };

export type SkillGapItem = SkillDemand & {
  /** Share of the analysed jobs that list this skill (0–1). */
  share: number;
};

export type CourseSuggestion = { id: string; slug: string; title: string; covers: { skillId: string; name: string }[] };

export type SkillGapResult = {
  totalJobs: number;
  /** In-demand skills the candidate already has, most requested first. */
  matched: SkillGapItem[];
  /** In-demand skills the candidate does not list yet, most requested first. */
  missing: SkillGapItem[];
  /** Share of the analysed in-demand skills the candidate already has (0–100). */
  coverage: number;
  suggestions: CourseSuggestion[];
};

export function computeSkillGap(input: {
  candidateSkillIds: Iterable<string>;
  demand: readonly SkillDemand[];
  totalJobs: number;
  courses: readonly CourseOffer[];
  /** Only skills listed on at least this share of jobs count as "in demand". */
  minShare?: number;
  maxMissing?: number;
  maxSuggestions?: number;
}): SkillGapResult {
  const { totalJobs } = input;
  const minShare = input.minShare ?? 0;
  const owned = new Set(input.candidateSkillIds);
  const ranked = [...input.demand]
    .filter((d) => d.jobCount > 0)
    .map((d) => ({ ...d, share: totalJobs > 0 ? Math.min(1, d.jobCount / totalJobs) : 0 }))
    .filter((d) => d.share >= minShare)
    .sort((a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name));

  const matched = ranked.filter((d) => owned.has(d.skillId));
  const missingAll = ranked.filter((d) => !owned.has(d.skillId));
  const missing = missingAll.slice(0, input.maxMissing ?? 10);
  const coverage = ranked.length ? Math.round((matched.length / ranked.length) * 100) : 0;

  const missingById = new Map(missing.map((m) => [m.skillId, m]));
  const suggestions = input.courses
    .map((course) => {
      const covers = course.skillIds.filter((id) => missingById.has(id)).map((id) => ({ skillId: id, name: missingById.get(id)!.name }));
      const weight = covers.reduce((sum, c) => sum + missingById.get(c.skillId)!.jobCount, 0);
      return { id: course.id, slug: course.slug, title: course.title, covers, weight };
    })
    .filter((s) => s.covers.length > 0)
    .sort((a, b) => b.weight - a.weight || b.covers.length - a.covers.length || a.title.localeCompare(b.title))
    .slice(0, input.maxSuggestions ?? 6)
    .map((s): CourseSuggestion => ({ id: s.id, slug: s.slug, title: s.title, covers: s.covers }));

  return { totalJobs, matched, missing, coverage, suggestions };
}
