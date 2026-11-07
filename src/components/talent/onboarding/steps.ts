/**
 * People Portal onboarding rules (pure, client-safe): the age gate (DPDP Rules 2025, CONVENTIONS 15.6)
 * and the progressive, skippable steps that follow it (spec 8.1). Persisted state lives in
 * users.preferences.talentOnboarding (see src/app/talent/onboarding/_lib/state.ts).
 */
import { ADULT_AGE, ageOn } from "@/modules/candidates/profile-rules";

/** Steps after the age gate, in order. Every one of them can be skipped. */
export const ONBOARDING_STEPS = ["goals", "basics", "skills", "availability", "resume", "visibility"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_GOALS = ["job", "internship", "training", "overseas"] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

/** Goals a child (under 18) may pick: no overseas employment (DPDP children's data rule). */
export const MINOR_GOALS: readonly OnboardingGoal[] = ["job", "internship", "training"];

export type OnboardingState = {
  goals: OnboardingGoal[];
  /** Steps saved at least once. */
  completed: OnboardingStep[];
  /** Steps the candidate chose to skip (they can come back at any time). */
  skipped: OnboardingStep[];
  /** ISO timestamp when the candidate reached the end of the flow. */
  finishedAt: string | null;
};

export const EMPTY_ONBOARDING_STATE: OnboardingState = { goals: [], completed: [], skipped: [], finishedAt: null };

const isStep = (value: unknown): value is OnboardingStep => typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
const isGoal = (value: unknown): value is OnboardingGoal => typeof value === "string" && (ONBOARDING_GOALS as readonly string[]).includes(value);

function uniqueOf<T>(values: unknown, guard: (v: unknown) => v is T): T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(guard))];
}

/** Defensive parse of the stored JSON (unknown keys and bad values are dropped). */
export function parseOnboardingState(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_ONBOARDING_STATE };
  const value = raw as Record<string, unknown>;
  const finishedAt = typeof value.finishedAt === "string" && !Number.isNaN(Date.parse(value.finishedAt)) ? value.finishedAt : null;
  return {
    goals: uniqueOf(value.goals, isGoal),
    completed: uniqueOf(value.completed, isStep),
    skipped: uniqueOf(value.skipped, isStep),
    finishedAt,
  };
}

/** Mark a step saved (removes it from the skipped list). */
export function markStep(state: OnboardingState, step: OnboardingStep, how: "completed" | "skipped"): OnboardingState {
  if (how === "completed") {
    return { ...state, completed: [...new Set([...state.completed, step])], skipped: state.skipped.filter((s) => s !== step) };
  }
  if (state.completed.includes(step)) return state;
  return { ...state, skipped: [...new Set([...state.skipped, step])] };
}

/** The first step neither saved nor skipped — where a returning candidate resumes. Null when all are handled. */
export function nextOnboardingStep(state: OnboardingState): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !state.completed.includes(step) && !state.skipped.includes(step)) ?? null;
}

/** The step after `step` in the fixed order, or null after the last one. */
export function stepAfter(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[index + 1] ?? null;
}

/**
 * Which step to show: an explicitly requested step (?step=, any step may be revisited), otherwise
 * the resume point, otherwise the summary ("done").
 */
export function resolveOnboardingStep(requested: string | null | undefined, state: OnboardingState): OnboardingStep | "done" {
  if (requested === "done") return "done";
  if (isStep(requested)) return requested;
  return nextOnboardingStep(state) ?? "done";
}

export type AgeGate =
  /** No date of birth yet: ask for it before anything else. */
  | { state: "needs_dob" }
  /** Under 18 without a granted guardian consent: only the explanation and the age step are available. */
  | { state: "needs_guardian"; age: number }
  | { state: "complete"; minor: boolean; age: number };

/**
 * Age gate decision. A candidate passes when the date of birth shows 18 or older, or — for a child —
 * when the latest guardian_consent record is granted (a withdrawn consent closes the gate again).
 */
export function resolveAgeGate(dateOfBirth: string | null | undefined, guardianConsentGranted: boolean, today: Date = new Date()): AgeGate {
  if (!dateOfBirth) return { state: "needs_dob" };
  const age = ageOn(dateOfBirth, today);
  if (age === null) return { state: "needs_dob" };
  if (age >= ADULT_AGE) return { state: "complete", minor: false, age };
  return guardianConsentGranted ? { state: "complete", minor: true, age } : { state: "needs_guardian", age };
}

/** Goals allowed for this candidate (overseas removed for children). */
export function allowedGoals(minor: boolean): readonly OnboardingGoal[] {
  return minor ? MINOR_GOALS : ONBOARDING_GOALS;
}
