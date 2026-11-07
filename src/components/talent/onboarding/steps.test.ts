import { describe, expect, it } from "vitest";

import {
  EMPTY_ONBOARDING_STATE,
  allowedGoals,
  markStep,
  nextOnboardingStep,
  parseOnboardingState,
  resolveAgeGate,
  resolveOnboardingStep,
  stepAfter,
} from "./steps";

const today = new Date(Date.UTC(2026, 10, 7)); // 2026-11-07

describe("resolveAgeGate", () => {
  it("asks for a date of birth first", () => {
    expect(resolveAgeGate(null, false, today)).toEqual({ state: "needs_dob" });
    expect(resolveAgeGate("not-a-date", true, today)).toEqual({ state: "needs_dob" });
  });

  it("lets adults through on their 18th birthday", () => {
    expect(resolveAgeGate("2008-11-07", false, today)).toEqual({ state: "complete", minor: false, age: 18 });
  });

  it("holds a child until guardian consent is granted", () => {
    expect(resolveAgeGate("2008-11-08", false, today)).toEqual({ state: "needs_guardian", age: 17 });
    expect(resolveAgeGate("2010-01-01", true, today)).toEqual({ state: "complete", minor: true, age: 16 });
  });
});

describe("onboarding state", () => {
  it("parses stored JSON defensively", () => {
    expect(parseOnboardingState(null)).toEqual(EMPTY_ONBOARDING_STATE);
    expect(parseOnboardingState({ goals: ["job", "job", "space"], completed: ["goals", 3], skipped: "x", finishedAt: "nope" })).toEqual({
      goals: ["job"],
      completed: ["goals"],
      skipped: [],
      finishedAt: null,
    });
  });

  it("resumes at the first step neither saved nor skipped", () => {
    let state = markStep(EMPTY_ONBOARDING_STATE, "goals", "completed");
    state = markStep(state, "basics", "skipped");
    expect(nextOnboardingStep(state)).toBe("skills");
    expect(resolveOnboardingStep(undefined, state)).toBe("skills");
    expect(resolveOnboardingStep("basics", state)).toBe("basics");
    expect(resolveOnboardingStep("bogus", state)).toBe("skills");
  });

  it("saving a skipped step clears the skip, skipping a saved step keeps it saved", () => {
    const skipped = markStep(EMPTY_ONBOARDING_STATE, "resume", "skipped");
    const saved = markStep(skipped, "resume", "completed");
    expect(saved.skipped).toEqual([]);
    expect(saved.completed).toEqual(["resume"]);
    expect(markStep(saved, "resume", "skipped")).toBe(saved);
  });

  it("shows the summary when every step is handled", () => {
    const state = { ...EMPTY_ONBOARDING_STATE, completed: ["goals", "basics", "skills", "availability", "resume"], skipped: ["visibility"] } as const;
    expect(resolveOnboardingStep(null, { ...state, completed: [...state.completed], skipped: [...state.skipped] })).toBe("done");
    expect(stepAfter("visibility")).toBeNull();
    expect(stepAfter("goals")).toBe("basics");
  });

  it("never offers overseas goals to children", () => {
    expect(allowedGoals(true)).not.toContain("overseas");
    expect(allowedGoals(false)).toContain("overseas");
  });
});
