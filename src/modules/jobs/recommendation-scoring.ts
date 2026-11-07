/**
 * Explainable, rules-based job recommendations (pure, client-safe). NOT machine learning: every
 * point comes from a rule below and is returned as a reason the People Portal can show
 * ("Matches 3 of 4 required skills", "In a country you prefer"…).
 *
 * | Signal       | Max | Rule                                                                         |
 * |--------------|-----|------------------------------------------------------------------------------|
 * | skills       | 30  | share of the job's required skills the candidate has (24) + optional ones (6)|
 * | role         | 20  | category preferred 20 · title matches a preferred role 16 · category in work history 12 |
 * | location     | 20  | see `scoreLocation` (city 20 · region 14 · preferred overseas country 20 …)   |
 * | experience   | 15  | within the job's range 15 · less than a year short or above the range 8      |
 * | salary       | 10  | same currency + period: pays at least the expectation 10 · within 10% 5     |
 * | work style   | 5   | employment type preferred 3 · work mode preferred 2                          |
 *
 * Gender, age, nationality, religion and similar characteristics are never inputs. Overseas jobs are
 * excluded for candidates who are not open to overseas work (minors are never open to it).
 */

export const RECOMMENDATION_WEIGHTS = { skills: 30, role: 20, location: 20, experience: 15, salary: 10, workStyle: 5 } as const;
export const MIN_RECOMMENDATION_SCORE = 25;

export type RecommendationReasonCode =
  | "skills_match"
  | "preferred_category"
  | "preferred_role"
  | "experience_category"
  | "location_city"
  | "location_region"
  | "location_country"
  | "relocation"
  | "preferred_location"
  | "overseas_open"
  | "remote_preference"
  | "remote_in_country"
  | "experience_fit"
  | "experience_close"
  | "salary_fit"
  | "salary_close"
  | "employment_type"
  | "work_mode";

export type RecommendationReason = {
  code: RecommendationReasonCode;
  points: number;
  /** Values for the translated message (talent-jobs namespace "recommendations.<code>"). */
  params: Record<string, string | number>;
  /** English fallback. */
  text: string;
};

type Place = { countryCode: string | null; stateRegion: string | null; city: string | null };

export type RecommendationCandidate = {
  skillIds: readonly string[];
  preferredCategoryIds: readonly string[];
  experienceCategoryIds: readonly string[];
  preferredRoles: readonly string[];
  totalExperienceMonths: number | null;
  desiredEmploymentTypes: readonly string[];
  preferredWorkModes: readonly string[];
  current: Place;
  preferredLocations: readonly Place[];
  /** False for minors regardless of the stored preference. */
  openToOverseas: boolean;
  willingToRelocate: boolean;
  expectedSalary: { amountMinor: number; currency: string; period: string } | null;
};

export type RecommendationJob = {
  title: string;
  jobCategoryId: string | null;
  categoryName: string | null;
  skills: readonly { id: string; name: string; isRequired: boolean }[];
  employmentType: string;
  workMode: string;
  primary: Place;
  extraLocations: readonly Place[];
  isOverseas: boolean;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  /** Only a salary the candidate can see (salaryVisible). */
  salary: { minMinor: number | null; maxMinor: number | null; currency: string; period: string } | null;
};

export type RecommendationScore = { score: number; reasons: RecommendationReason[]; excluded: "not_open_to_overseas" | null };

const lower = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const samePlaceText = (a: string | null | undefined, b: string | null | undefined) => lower(a) !== "" && lower(a) === lower(b);
const listNames = (names: string[]) => names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "");

function scoreSkills(c: RecommendationCandidate, job: RecommendationJob): RecommendationReason | null {
  if (!job.skills.length) return null;
  const owned = new Set(c.skillIds);
  const required = job.skills.filter((s) => s.isRequired);
  const optional = job.skills.filter((s) => !s.isRequired);
  const matchedRequired = required.filter((s) => owned.has(s.id));
  const matchedOptional = optional.filter((s) => owned.has(s.id));
  const W = RECOMMENDATION_WEIGHTS.skills;
  let points: number;
  if (required.length && optional.length) points = 24 * (matchedRequired.length / required.length) + 6 * (matchedOptional.length / optional.length);
  else if (required.length) points = W * (matchedRequired.length / required.length);
  else points = W * (matchedOptional.length / optional.length);
  const matched = [...matchedRequired, ...matchedOptional];
  if (!matched.length) return null;
  const total = required.length || optional.length;
  const matchedCount = required.length ? matchedRequired.length : matchedOptional.length;
  return {
    code: "skills_match",
    points: Math.round(points),
    params: { matched: matchedCount, total, skills: listNames(matched.map((s) => s.name)) },
    text: `Matches ${matchedCount} of ${total} ${required.length ? "required " : ""}skills: ${listNames(matched.map((s) => s.name))}`,
  };
}

function titleMatchesRole(title: string, roles: readonly string[]): string | null {
  const t = lower(title);
  for (const role of roles) {
    const r = lower(role);
    if (r.length >= 3 && (t.includes(r) || r.includes(t))) return role;
  }
  return null;
}

function scoreRole(c: RecommendationCandidate, job: RecommendationJob): RecommendationReason | null {
  const category = job.categoryName ?? "this field";
  if (job.jobCategoryId && c.preferredCategoryIds.includes(job.jobCategoryId)) {
    return { code: "preferred_category", points: 20, params: { category }, text: `In ${category}, a category you chose` };
  }
  const role = titleMatchesRole(job.title, c.preferredRoles);
  if (role) return { code: "preferred_role", points: 16, params: { role }, text: `Matches the role you want: ${role}` };
  if (job.jobCategoryId && c.experienceCategoryIds.includes(job.jobCategoryId)) {
    return { code: "experience_category", points: 12, params: { category }, text: `You have worked in ${category}` };
  }
  return null;
}

/**
 * Location rules: remote jobs score by work-mode preference; overseas jobs need openness to overseas
 * work (20 when the country is a preferred location, else 12); home-country jobs score by the
 * candidate's or a preferred city (20), region (14), or the same country (10 when willing to
 * relocate, else 6).
 */
export function scoreLocation(c: RecommendationCandidate, job: RecommendationJob): RecommendationReason | null {
  const places = [job.primary, ...job.extraLocations].filter((p) => p.countryCode);
  if (job.workMode === "remote") {
    if (c.preferredWorkModes.includes("remote")) return { code: "remote_preference", points: 20, params: {}, text: "Remote work, as you prefer" };
    if (!job.primary.countryCode || job.primary.countryCode === c.current.countryCode) {
      return { code: "remote_in_country", points: 10, params: {}, text: "Remote work you can do from where you live" };
    }
    return null;
  }
  if (job.isOverseas) {
    if (!c.openToOverseas) return null;
    const preferred = places.find((p) => c.preferredLocations.some((l) => l.countryCode === p.countryCode));
    if (preferred) return { code: "preferred_location", points: 20, params: { country: preferred.countryCode ?? "" }, text: "In a country you prefer to work in" };
    return { code: "overseas_open", points: 12, params: {}, text: "Overseas work, which you are open to" };
  }
  const anchors: Place[] = [c.current, ...c.preferredLocations];
  for (const place of places) {
    if (anchors.some((a) => a.countryCode === place.countryCode && samePlaceText(a.city, place.city))) {
      return { code: "location_city", points: 20, params: { city: place.city ?? "" }, text: `In ${place.city}, where you live or want to work` };
    }
  }
  for (const place of places) {
    if (anchors.some((a) => a.countryCode === place.countryCode && samePlaceText(a.stateRegion, place.stateRegion))) {
      return { code: "location_region", points: 14, params: { region: place.stateRegion ?? "" }, text: `In ${place.stateRegion}, near you` };
    }
  }
  if (places.some((p) => anchors.some((a) => a.countryCode === p.countryCode))) {
    return c.willingToRelocate
      ? { code: "relocation", points: 10, params: {}, text: "In your country, and you are willing to relocate" }
      : { code: "location_country", points: 6, params: {}, text: "In your country" };
  }
  return null;
}

function scoreExperience(c: RecommendationCandidate, job: RecommendationJob): RecommendationReason | null {
  if (c.totalExperienceMonths === null || (job.experienceMinYears === null && job.experienceMaxYears === null)) return null;
  const years = c.totalExperienceMonths / 12;
  const min = job.experienceMinYears ?? 0;
  const max = job.experienceMaxYears;
  const range = max === null ? `${min}+ years` : `${min}–${max} years`;
  if (years >= min && (max === null || years < max + 1)) {
    return { code: "experience_fit", points: 15, params: { range }, text: `Your experience fits the ${range} asked for` };
  }
  if (years < min && min - years < 1) return { code: "experience_close", points: 8, params: { range }, text: `Your experience is close to the ${range} asked for` };
  if (max !== null && years >= max + 1) return { code: "experience_close", points: 8, params: { range }, text: `You have more than the ${range} asked for` };
  return null;
}

function scoreSalary(c: RecommendationCandidate, job: RecommendationJob): RecommendationReason | null {
  const s = job.salary;
  const e = c.expectedSalary;
  if (!s || !e || s.currency !== e.currency || s.period !== e.period) return null;
  const top = s.maxMinor ?? s.minMinor;
  if (top === null) return null;
  if (top >= e.amountMinor) return { code: "salary_fit", points: 10, params: {}, text: "Pays at least your expected salary" };
  if (top >= e.amountMinor * 0.9) return { code: "salary_close", points: 5, params: {}, text: "Pays close to your expected salary" };
  return null;
}

function scoreWorkStyle(c: RecommendationCandidate, job: RecommendationJob): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  if (c.desiredEmploymentTypes.includes(job.employmentType)) {
    reasons.push({ code: "employment_type", points: 3, params: { type: job.employmentType }, text: "An employment type you want" });
  }
  if (c.preferredWorkModes.includes(job.workMode)) reasons.push({ code: "work_mode", points: 2, params: { mode: job.workMode }, text: "A work mode you prefer" });
  return reasons;
}

/** Score one job for one candidate. Deterministic; reasons are sorted by points (highest first). */
export function scoreJobForCandidate(candidate: RecommendationCandidate, job: RecommendationJob): RecommendationScore {
  if (job.isOverseas && job.workMode !== "remote" && !candidate.openToOverseas) return { score: 0, reasons: [], excluded: "not_open_to_overseas" };
  const reasons = [scoreSkills(candidate, job), scoreRole(candidate, job), scoreLocation(candidate, job), scoreExperience(candidate, job), scoreSalary(candidate, job), ...scoreWorkStyle(candidate, job)].filter(
    (r): r is RecommendationReason => r !== null && r.points > 0,
  );
  reasons.sort((a, b) => b.points - a.points);
  const score = Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0));
  return { score, reasons, excluded: null };
}

/** A recommendation needs enough evidence and at least one substantive match (skills, role or location). */
export function isRecommendable(result: RecommendationScore): boolean {
  if (result.excluded || result.score < MIN_RECOMMENDATION_SCORE) return false;
  return result.reasons.some((r) => r.code === "skills_match" || r.code === "preferred_category" || r.code === "preferred_role" || r.code === "experience_category");
}
