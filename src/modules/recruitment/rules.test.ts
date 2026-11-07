import { describe, expect, it } from "vitest";

import { DEFAULT_CANDIDATE_PRIVACY, canRevealContact, canSeeFullName, isDiscoverableByOrg, maskPersonName, privacyOrDefault } from "./visibility";
import { existingApplicationDecision, jobApplicationBlocker, minorOverseasBlocker, shareWithEmployerOnCreate, type JobOpenState } from "./rules";
import { MAX_TEXT_ANSWER_LENGTH, coerceAnswer, evaluateKnockout, validateScreeningAnswers, type ScreeningQuestionInput } from "./screening";

const now = new Date("2026-11-07T10:00:00Z");
const openJob = (overrides: Partial<JobOpenState> = {}): JobOpenState => ({
  status: "published",
  deletedAt: null,
  applyMode: "platform",
  applicationDeadline: null,
  expiresAt: null,
  organizationStatus: "verified",
  organizationDeletedAt: null,
  ...overrides,
});

describe("application creation rules", () => {
  it("accepts published, open, unexpired jobs", () => {
    expect(jobApplicationBlocker(openJob(), now)).toBeNull();
    expect(jobApplicationBlocker(openJob({ applicationDeadline: new Date("2026-11-08T00:00:00Z"), organizationStatus: null }), now)).toBeNull();
  });

  it("rejects unpublished, deleted, external-apply, expired and suspended-employer jobs", () => {
    for (const status of ["draft", "pending_approval", "changes_requested", "paused", "closed", "rejected", "archived"] as const) {
      expect(jobApplicationBlocker(openJob({ status }), now)?.code).toBe("job_closed");
    }
    expect(jobApplicationBlocker(openJob({ deletedAt: now }), now)?.code).toBe("job_unavailable");
    expect(jobApplicationBlocker(openJob({ organizationStatus: "suspended" }), now)?.code).toBe("job_unavailable");
    expect(jobApplicationBlocker(openJob({ organizationDeletedAt: now }), now)?.code).toBe("job_unavailable");
    expect(jobApplicationBlocker(openJob({ applyMode: "external_url" }), now)?.code).toBe("external_apply");
    expect(jobApplicationBlocker(openJob({ applicationDeadline: new Date("2026-11-07T10:00:00Z") }), now)?.code).toBe("job_expired");
    expect(jobApplicationBlocker(openJob({ expiresAt: new Date("2026-11-01T00:00:00Z") }), now)?.code).toBe("job_expired");
  });

  it("treats a published job with a future publication time as not live yet", () => {
    expect(jobApplicationBlocker(openJob({ publishedAt: new Date("2026-11-08T09:00:00Z") }), now)?.code).toBe("job_closed");
    expect(jobApplicationBlocker(openJob({ publishedAt: new Date("2026-11-07T09:00:00Z") }), now)).toBeNull();
    expect(jobApplicationBlocker(openJob({ publishedAt: null }), now)).toBeNull();
  });

  it("keeps minors out of overseas jobs, with wording for the candidate and for staff / partners", () => {
    expect(minorOverseasBlocker({ isOverseas: false }, true, "candidate")).toBeNull();
    expect(minorOverseasBlocker({ isOverseas: true }, false, "candidate")).toBeNull();
    expect(minorOverseasBlocker({ isOverseas: true }, true, "candidate")).toMatchObject({ code: "minor_overseas", message: expect.stringContaining("18 or over") });
    expect(minorOverseasBlocker({ isOverseas: true }, true, "staff")?.message).toMatch(/under 18/);
    expect(minorOverseasBlocker({ isOverseas: true }, true, "partner")?.code).toBe("minor_overseas");
  });

  it("allows one application per job and candidate; candidates may re-apply after withdrawing", () => {
    expect(existingApplicationDecision(null, "candidate")).toBe("create");
    expect(existingApplicationDecision({ status: "withdrawn" }, "candidate")).toBe("reopen");
    expect(existingApplicationDecision({ status: "withdrawn" }, "staff")).toBe("duplicate");
    expect(existingApplicationDecision({ status: "withdrawn" }, "partner")).toBe("duplicate");
    for (const status of ["active", "hired", "rejected", "closed"] as const) expect(existingApplicationDecision({ status }, "candidate")).toBe("duplicate");
  });

  it("shares with the employer at once unless Venkat Sai screens first", () => {
    expect(shareWithEmployerOnCreate({ organizationId: "o", managedByVenkatSai: false })).toBe(true);
    expect(shareWithEmployerOnCreate({ organizationId: "o", managedByVenkatSai: true })).toBe(false);
    expect(shareWithEmployerOnCreate({ organizationId: null, managedByVenkatSai: true })).toBe(false);
  });
});

describe("screening answers", () => {
  const questions: ScreeningQuestionInput[] = [
    { id: "q1", question: "Do you hold a valid passport?", type: "yes_no", options: [], isRequired: true, knockoutAnswer: { kind: "equals", value: false } },
    { id: "q2", question: "Years of TIG welding?", type: "number", options: [], isRequired: true, knockoutAnswer: { kind: "below", value: 3 } },
    {
      id: "q3",
      question: "Positions qualified",
      type: "multi_choice",
      options: [
        { value: "3g", label: "3G" },
        { value: "6g", label: "6G" },
      ],
      isRequired: false,
      knockoutAnswer: { kind: "any_of", values: ["none"] },
    },
    { id: "q4", question: "Notes", type: "text", options: [], isRequired: false, knockoutAnswer: null },
    {
      id: "q5",
      question: "Shift",
      type: "single_choice",
      options: [
        { value: "day", label: "Day" },
        { value: "night", label: "Night" },
      ],
      isRequired: false,
      knockoutAnswer: { kind: "equals", value: "night" },
    },
  ];

  it("requires mandatory answers for candidate applications only", () => {
    const candidate = validateScreeningAnswers(questions, {}, { requireMandatory: true });
    expect(Object.keys(candidate.errors).sort()).toEqual(["q1", "q2"]);
    const staff = validateScreeningAnswers(questions, {}, { requireMandatory: false });
    expect(staff.errors).toEqual({});
    expect(staff.answers).toEqual([]);
  });

  it("coerces answers to the question type and rejects invalid ones", () => {
    const result = validateScreeningAnswers(questions, { q1: "yes", q2: "5", q3: ["6g", "6g"], q4: "  ok  ", q5: "morning" }, { requireMandatory: true });
    expect(result.errors).toEqual({ q5: "Choose one of the options." });
    expect(result.answers.map((a) => [a.questionId, a.answer])).toEqual([
      ["q1", true],
      ["q2", 5],
      ["q3", ["6g"]],
      ["q4", "ok"],
    ]);
    expect(coerceAnswer(questions[2]!, ["9g"])).toMatchObject({ ok: false });
    expect(coerceAnswer(questions[3]!, "x".repeat(MAX_TEXT_ANSWER_LENGTH + 1))).toMatchObject({ ok: false });
    expect(coerceAnswer(questions[1]!, "abc")).toMatchObject({ ok: false });
  });

  it("flags knockout answers for review and never rejects them", () => {
    const result = validateScreeningAnswers(questions, { q1: false, q2: 1, q5: "night" }, { requireMandatory: true });
    expect(result.errors).toEqual({});
    expect(result.knockoutFlags.map((f) => f.questionId)).toEqual(["q1", "q2", "q5"]);
    expect(result.answers.every((a) => a.isFlagged)).toBe(true);
    expect(result.answers[0]!.questionSnapshot).toEqual({ question: "Do you hold a valid passport?", type: "yes_no", options: [], isRequired: true });
  });

  it("evaluates each knockout rule kind", () => {
    expect(evaluateKnockout({ kind: "equals", value: false }, false)).toBeTruthy();
    expect(evaluateKnockout({ kind: "equals", value: false }, true)).toBeNull();
    expect(evaluateKnockout({ kind: "equals", value: "Night" }, "night")).toBeTruthy();
    expect(evaluateKnockout({ kind: "equals", value: 2 }, 2)).toBeTruthy();
    expect(evaluateKnockout({ kind: "any_of", values: ["a", "b"] }, ["c", "b"])).toBeTruthy();
    expect(evaluateKnockout({ kind: "any_of", values: ["a"] }, "c")).toBeNull();
    expect(evaluateKnockout({ kind: "below", value: 3 }, 2)).toBeTruthy();
    expect(evaluateKnockout({ kind: "below", value: 3 }, 3)).toBeNull();
    expect(evaluateKnockout({ kind: "above", value: 60 }, 61)).toBeTruthy();
    expect(evaluateKnockout(null, true)).toBeNull();
  });
});

describe("candidate privacy for organisations", () => {
  const org = { id: "org-1", status: "verified" as const };
  const unverified = { id: "org-2", status: "pending" as const };

  it("uses protective defaults when no settings row exists", () => {
    expect(privacyOrDefault(null)).toEqual(DEFAULT_CANDIDATE_PRIVACY);
    expect(privacyOrDefault({ showPhoto: true, blockedOrganizationIds: null })).toMatchObject({ showPhoto: true, blockedOrganizationIds: [], showFullNameToEmployers: false });
  });

  it("follows visibility and blocked organisations for discovery", () => {
    const privacy = privacyOrDefault(null);
    expect(isDiscoverableByOrg({ visibility: "public_to_employers", deletedAt: null }, privacy, unverified)).toBe(true);
    expect(isDiscoverableByOrg({ visibility: "verified_employers", deletedAt: null }, privacy, org)).toBe(true);
    expect(isDiscoverableByOrg({ visibility: "verified_employers", deletedAt: null }, privacy, unverified)).toBe(false);
    expect(isDiscoverableByOrg({ visibility: "venkat_sai_only", deletedAt: null }, privacy, org)).toBe(false);
    expect(isDiscoverableByOrg({ visibility: "hidden", deletedAt: null }, privacy, org)).toBe(false);
    expect(isDiscoverableByOrg({ visibility: "public_to_employers", deletedAt: now }, privacy, org)).toBe(false);
    expect(isDiscoverableByOrg({ visibility: "public_to_employers", deletedAt: null }, { blockedOrganizationIds: ["org-1"] }, org)).toBe(false);
  });

  it("masks names unless allowed or there is a relationship; contact needs a relationship", () => {
    expect(maskPersonName("Ravi Kumar Reddy")).toBe("R. K. R.");
    expect(maskPersonName("")).toBe("Candidate");
    const none = { hasSharedApplication: false, hasActiveUnlock: false };
    expect(canSeeFullName({ showFullNameToEmployers: false }, none)).toBe(false);
    expect(canSeeFullName({ showFullNameToEmployers: true }, none)).toBe(true);
    expect(canSeeFullName({ showFullNameToEmployers: false }, { ...none, hasActiveUnlock: true })).toBe(true);
    expect(canRevealContact({ showContactToUnlockedOnly: false }, none)).toBe(false);
    expect(canRevealContact({ showContactToUnlockedOnly: true }, { ...none, hasSharedApplication: true })).toBe(true);
  });
});
