/**
 * Profile completeness scoring and next-best-action hints (pure, client-safe).
 *
 * The score is recomputed by the candidates service after EVERY profile change and stored in
 * candidate_profiles.profileCompleteness (0–100). Weights (sum = 100):
 *
 * | Item        | Weight | Complete when                                                            |
 * |-------------|--------|--------------------------------------------------------------------------|
 * | headline    | 5      | a headline is set                                                        |
 * | location    | 5      | current country and city are set                                         |
 * | summary     | 5      | "about" or a career objective is written                                 |
 * | contact     | 10     | the account has a verified email address or phone number                 |
 * | preferences | 15     | roles/categories 5 · employment types or work modes 3 · availability 4 · expected salary 3 |
 * | experience  | 15     | at least one experience entry, or the candidate is a fresher             |
 * | education   | 10     | at least one education entry                                             |
 * | skills      | 15     | 3+ skills (1–2 skills earn 8)                                            |
 * | languages   | 5      | at least one language                                                    |
 * | resume      | 10     | a resume is uploaded                                                     |
 * | photo       | 5      | a profile photo is uploaded (shown to employers only if the candidate allows it) |
 *
 * Nothing sensitive (date of birth, gender, nationality, identity numbers) is scored: a profile can
 * reach 100 without sharing any of it. Hints are ordered by the points they would add.
 */
import type { CandidateVisibility } from "@/db/schema/candidates";

import { PROFILE_PATH, type ProfileSection } from "./constants";

export const COMPLETENESS_WEIGHTS = {
  headline: 5,
  location: 5,
  summary: 5,
  contact: 10,
  preferences: 15,
  experience: 15,
  education: 10,
  skills: 15,
  languages: 5,
  resume: 10,
  photo: 5,
} as const;

export type CompletenessItemKey = keyof typeof COMPLETENESS_WEIGHTS;

/** Points inside the preferences item. */
export const PREFERENCE_POINTS = { roles: 5, workStyle: 3, availability: 4, salary: 3 } as const;
/** Skills earn the full weight from this many skills, a partial weight below it. */
export const SKILLS_FOR_FULL_SCORE = 3;
export const PARTIAL_SKILLS_POINTS = 8;

export type CompletenessInput = {
  headline: string | null;
  about: string | null;
  careerObjective: string | null;
  currentCountryCode: string | null;
  city: string | null;
  contactVerified: boolean;
  preferredCategoryCount: number;
  preferredRoleCount: number;
  desiredEmploymentTypeCount: number;
  preferredWorkModeCount: number;
  availability: string | null;
  hasExpectedSalary: boolean;
  experienceCount: number;
  isFresher: boolean;
  educationCount: number;
  skillCount: number;
  languageCount: number;
  hasResume: boolean;
  hasPhoto: boolean;
  /** Hint-only inputs (not scored). */
  openToOverseas: boolean;
  passportStatus: string | null;
  unverifiedDocumentCount: number;
  rejectedDocumentCount: number;
  visibility: CandidateVisibility;
};

export type CompletenessItem = {
  key: CompletenessItemKey;
  section: ProfileSection;
  weight: number;
  earned: number;
  complete: boolean;
};

export type NextBestActionKey =
  | "add_headline"
  | "add_location"
  | "add_summary"
  | "verify_contact"
  | "add_preferred_roles"
  | "add_work_style"
  | "add_availability"
  | "add_expected_salary"
  | "add_experience"
  | "add_education"
  | "add_skills"
  | "add_more_skills"
  | "add_languages"
  | "upload_resume"
  | "add_photo"
  | "add_passport_status"
  | "fix_rejected_documents"
  | "submit_documents_for_verification"
  | "review_visibility";

export type NextBestAction = {
  key: NextBestActionKey;
  section: ProfileSection;
  /** Completeness points this action adds (0 for advice that is not scored). */
  points: number;
  /** Where the UI should send the candidate (profile anchor or account page). */
  href: string;
  /** English fallback; the People Portal translates `key` (talent-profile namespace). */
  label: string;
};

export type CompletenessResult = {
  score: number;
  items: CompletenessItem[];
  nextActions: NextBestAction[];
};

const SECTION_OF: Record<CompletenessItemKey, ProfileSection> = {
  headline: "professional",
  location: "personal",
  summary: "professional",
  contact: "personal",
  preferences: "preferences",
  experience: "experience",
  education: "education",
  skills: "skills",
  languages: "languages",
  resume: "resume",
  photo: "photo",
};

const filled = (value: string | null | undefined): boolean => typeof value === "string" && value.trim().length > 0;

const href = (section: ProfileSection): string => `${PROFILE_PATH}#${section}`;

/** Score a profile and suggest what to do next. Deterministic for a given input. */
export function computeProfileCompleteness(input: CompletenessInput): CompletenessResult {
  const W = COMPLETENESS_WEIGHTS;
  const actions: (NextBestAction & { order: number })[] = [];
  const add = (key: NextBestActionKey, section: ProfileSection, points: number, label: string, link?: string) =>
    actions.push({ key, section, points, href: link ?? href(section), label, order: actions.length });

  const earned: Record<CompletenessItemKey, number> = {
    headline: 0,
    location: 0,
    summary: 0,
    contact: 0,
    preferences: 0,
    experience: 0,
    education: 0,
    skills: 0,
    languages: 0,
    resume: 0,
    photo: 0,
  };

  if (filled(input.headline)) earned.headline = W.headline;
  else add("add_headline", "professional", W.headline, "Add a headline that says what you do");

  if (filled(input.currentCountryCode) && filled(input.city)) earned.location = W.location;
  else add("add_location", "personal", W.location, "Add your current country and city");

  if (filled(input.about) || filled(input.careerObjective)) earned.summary = W.summary;
  else add("add_summary", "professional", W.summary, "Write a short summary about yourself");

  if (input.contactVerified) earned.contact = W.contact;
  else add("verify_contact", "personal", W.contact, "Verify your email address or phone number", "/account");

  // Preferences (15 = 5 + 3 + 4 + 3).
  if (input.preferredCategoryCount > 0 || input.preferredRoleCount > 0) earned.preferences += PREFERENCE_POINTS.roles;
  else add("add_preferred_roles", "preferences", PREFERENCE_POINTS.roles, "Choose the roles or job categories you want");
  if (input.desiredEmploymentTypeCount > 0 || input.preferredWorkModeCount > 0) earned.preferences += PREFERENCE_POINTS.workStyle;
  else add("add_work_style", "preferences", PREFERENCE_POINTS.workStyle, "Choose employment types or work modes you prefer");
  if (filled(input.availability)) earned.preferences += PREFERENCE_POINTS.availability;
  else add("add_availability", "preferences", PREFERENCE_POINTS.availability, "Tell employers when you can start");
  if (input.hasExpectedSalary) earned.preferences += PREFERENCE_POINTS.salary;
  else add("add_expected_salary", "preferences", PREFERENCE_POINTS.salary, "Add your expected salary");

  if (input.experienceCount > 0 || input.isFresher) earned.experience = W.experience;
  else add("add_experience", "experience", W.experience, "Add your work experience (or mark yourself as a fresher)");

  if (input.educationCount > 0) earned.education = W.education;
  else add("add_education", "education", W.education, "Add your education or training");

  if (input.skillCount >= SKILLS_FOR_FULL_SCORE) earned.skills = W.skills;
  else if (input.skillCount > 0) {
    earned.skills = PARTIAL_SKILLS_POINTS;
    add("add_more_skills", "skills", W.skills - PARTIAL_SKILLS_POINTS, `Add at least ${SKILLS_FOR_FULL_SCORE} skills`);
  } else add("add_skills", "skills", W.skills, "Add your skills");

  if (input.languageCount > 0) earned.languages = W.languages;
  else add("add_languages", "languages", W.languages, "Add the languages you speak");

  if (input.hasResume) earned.resume = W.resume;
  else add("upload_resume", "resume", W.resume, "Upload your resume");

  if (input.hasPhoto) earned.photo = W.photo;
  else add("add_photo", "photo", W.photo, "Add a profile photo");

  // Advice that is not scored.
  if (input.openToOverseas && !filled(input.passportStatus)) {
    add("add_passport_status", "personal", 0, "Tell us your passport status for overseas jobs");
  }
  if (input.rejectedDocumentCount > 0) {
    add("fix_rejected_documents", "documents", 0, "Some documents could not be verified — see why and upload them again");
  }
  if (input.unverifiedDocumentCount > 0) {
    add("submit_documents_for_verification", "documents", 0, "Submit your documents for verification");
  }

  const items: CompletenessItem[] = (Object.keys(W) as CompletenessItemKey[]).map((key) => ({
    key,
    section: SECTION_OF[key],
    weight: W[key],
    earned: earned[key],
    complete: earned[key] >= W[key],
  }));
  const score = Math.max(0, Math.min(100, items.reduce((sum, item) => sum + item.earned, 0)));

  // Visibility is the candidate's choice; only mention it once the profile is worth showing.
  if (score >= 60 && (input.visibility === "venkat_sai_only" || input.visibility === "hidden")) {
    add("review_visibility", "privacy", 0, "Choose whether employers can find your profile");
  }

  const nextActions: NextBestAction[] = actions
    .sort((a, b) => b.points - a.points || a.order - b.order)
    .map((a) => ({ key: a.key, section: a.section, points: a.points, href: a.href, label: a.label }));

  return { score, items, nextActions };
}

/**
 * Total experience in whole months from experience entries, counting overlapping periods once.
 * Open-ended (current) entries run until `today`. Entries without a start date are ignored.
 */
export function computeExperienceMonths(
  entries: ReadonlyArray<{ startDate: string | null; endDate: string | null; isCurrent: boolean }>,
  today: Date = new Date(),
): number {
  const toMonthIndex = (value: string): number | null => {
    const match = /^(\d{4})-(\d{2})/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 12 + (Number(match[2]) - 1);
  };
  const todayIndex = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const ranges: [number, number][] = [];
  for (const entry of entries) {
    if (!entry.startDate) continue;
    const start = toMonthIndex(entry.startDate);
    if (start === null) continue;
    const end = entry.isCurrent || !entry.endDate ? todayIndex : toMonthIndex(entry.endDate);
    if (end === null || end < start) continue;
    // A job from January to March counts as three months (inclusive of the end month).
    ranges.push([start, Math.min(end, todayIndex) + 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const range of ranges) {
    if (!current || range[0] > current[1]) {
      if (current) total += current[1] - current[0];
      current = [range[0], range[1]];
    } else {
      current[1] = Math.max(current[1], range[1]);
    }
  }
  if (current) total += current[1] - current[0];
  return Math.max(0, total);
}
