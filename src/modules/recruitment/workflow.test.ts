import { describe, expect, it } from "vitest";

import type { ApplicationActorType } from "@/db/schema/recruitment";

import { DEFAULT_WORKFLOW } from "./default-workflow";
import {
  allowedTargetStages,
  canTransition,
  dropTargetStage,
  initialStage,
  isForwardMove,
  PIPELINE_COLUMNS,
  pipelineColumnForStage,
  requirementPipelineColumn,
  resolveStage,
  STAGE_KEYS,
  statusForCategory,
  type StageLike,
} from "./workflow";

const stages: StageLike[] = DEFAULT_WORKFLOW.stages.map((s, i) => ({ id: `s${i}`, key: s.key, name: s.name, category: s.category, isTerminal: s.isTerminal, sortOrder: s.sortOrder, isActive: true }));
const stage = (key: string): StageLike => {
  const found = stages.find((s) => s.key === key);
  if (!found) throw new Error(`no stage ${key}`);
  return found;
};
const allowed = (actor: ApplicationActorType, from: string, to: string) => canTransition(actor, stage(from), stage(to)).allowed;

describe("default workflow", () => {
  it("has the 17 candidate stages of spec 8.5 in order", () => {
    expect(DEFAULT_WORKFLOW.stages.map((s) => s.name)).toEqual([
      "Submitted",
      "Under review",
      "Shortlisted",
      "Assessment pending",
      "Assessment completed",
      "Interview scheduled",
      "Interview completed",
      "Employer decision pending",
      "Selected",
      "Offer issued",
      "Offer accepted",
      "Documentation",
      "Mobilisation",
      "Joined",
      "Closed",
      "Rejected",
      "Withdrawn",
    ]);
    expect(new Set(DEFAULT_WORKFLOW.stages.map((s) => s.key)).size).toBe(17);
    const orders = DEFAULT_WORKFLOW.stages.map((s) => s.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("satisfies workflow_stages_terminal_chk (exit categories terminal; only terminal categories may be terminal)", () => {
    for (const s of DEFAULT_WORKFLOW.stages) {
      if (["closed", "rejected", "withdrawn"].includes(s.category)) expect(s.isTerminal, s.key).toBe(true);
      if (s.isTerminal) expect(["joined", "closed", "rejected", "withdrawn"], s.key).toContain(s.category);
    }
  });

  it("has candidate labels and Hindi / Telugu translations for every stage", () => {
    for (const s of DEFAULT_WORKFLOW.stages) {
      expect(s.candidateLabel.length).toBeGreaterThan(0);
      expect(s.candidateDescription.length).toBeGreaterThan(0);
      expect(s.candidateTranslations.hi?.label).toBeTruthy();
      expect(s.candidateTranslations.te?.label).toBeTruthy();
    }
  });

  it("does not double-notify steps that have their own notification or that the candidate performed", () => {
    const quiet = DEFAULT_WORKFLOW.stages.filter((s) => !s.notifyCandidate).map((s) => s.key);
    expect(quiet).toEqual(expect.arrayContaining([STAGE_KEYS.submitted, STAGE_KEYS.interviewScheduled, STAGE_KEYS.offerIssued, STAGE_KEYS.offerAccepted, STAGE_KEYS.withdrawn]));
    const loud = DEFAULT_WORKFLOW.stages.filter((s) => s.notifyCandidate).map((s) => s.key);
    expect(loud).toEqual(expect.arrayContaining([STAGE_KEYS.shortlisted, STAGE_KEYS.selected, STAGE_KEYS.rejected, STAGE_KEYS.joined]));
  });

  it("starts applications at Submitted", () => {
    expect(initialStage(stages)?.key).toBe(STAGE_KEYS.submitted);
  });
});

describe("derived application status", () => {
  it("maps stage categories to applications.status", () => {
    expect(statusForCategory("joined")).toBe("hired");
    expect(statusForCategory("rejected")).toBe("rejected");
    expect(statusForCategory("withdrawn")).toBe("withdrawn");
    expect(statusForCategory("closed")).toBe("closed");
    for (const c of ["applied", "screening", "assessment", "interview", "decision", "offer", "pre_joining"] as const) expect(statusForCategory(c)).toBe("active");
  });
});

describe("transition permission matrix", () => {
  const keys = stages.map((s) => s.key);

  it("never allows staying in the same stage", () => {
    for (const actor of ["staff", "employer", "candidate", "partner", "system"] as const) {
      for (const k of keys) expect(allowed(actor, k, k)).toBe(false);
    }
  });

  it("staff may move anywhere except out of Withdrawn", () => {
    for (const from of keys) {
      for (const to of keys) {
        if (from === to) continue;
        expect(allowed("staff", from, to), `${from} → ${to}`).toBe(from !== STAGE_KEYS.withdrawn);
      }
    }
    // Re-opening a rejected application is a staff decision.
    expect(allowed("staff", STAGE_KEYS.rejected, STAGE_KEYS.underReview)).toBe(true);
    expect(canTransition("staff", stage(STAGE_KEYS.withdrawn), stage(STAGE_KEYS.underReview))).toMatchObject({ allowed: false, reason: "withdrawn_is_final" });
  });

  it("employers act on review, shortlist, interview, decision and offer stages only", () => {
    const employerTargets = new Set([
      STAGE_KEYS.underReview,
      STAGE_KEYS.shortlisted,
      STAGE_KEYS.interviewScheduled,
      STAGE_KEYS.interviewCompleted,
      STAGE_KEYS.employerDecisionPending,
      STAGE_KEYS.selected,
      STAGE_KEYS.offerIssued,
      STAGE_KEYS.rejected,
    ]);
    const employerSources = new Set([
      STAGE_KEYS.submitted,
      STAGE_KEYS.underReview,
      STAGE_KEYS.shortlisted,
      STAGE_KEYS.assessmentPending,
      STAGE_KEYS.assessmentCompleted,
      STAGE_KEYS.interviewScheduled,
      STAGE_KEYS.interviewCompleted,
      STAGE_KEYS.employerDecisionPending,
      STAGE_KEYS.selected,
      STAGE_KEYS.offerIssued,
      STAGE_KEYS.offerAccepted,
    ]);
    for (const from of keys) {
      for (const to of keys) {
        if (from === to) continue;
        const expected = employerSources.has(from as never) && employerTargets.has(to as never);
        expect(allowed("employer", from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("employers cannot accept offers, start documentation, confirm joining or reopen closed applications", () => {
    expect(canTransition("employer", stage(STAGE_KEYS.offerIssued), stage(STAGE_KEYS.offerAccepted))).toMatchObject({ allowed: false, reason: "target_not_allowed" });
    expect(allowed("employer", STAGE_KEYS.offerAccepted, STAGE_KEYS.documentation)).toBe(false);
    expect(allowed("employer", STAGE_KEYS.mobilisation, STAGE_KEYS.joined)).toBe(false);
    expect(canTransition("employer", stage(STAGE_KEYS.documentation), stage(STAGE_KEYS.rejected))).toMatchObject({ allowed: false, reason: "actor_not_allowed" });
    expect(canTransition("employer", stage(STAGE_KEYS.rejected), stage(STAGE_KEYS.shortlisted))).toMatchObject({ allowed: false, reason: "from_final" });
    expect(allowed("employer", STAGE_KEYS.underReview, STAGE_KEYS.assessmentPending)).toBe(false);
  });

  it("partners cannot move applications at all", () => {
    for (const from of keys) for (const to of keys) expect(allowed("partner", from, to)).toBe(false);
  });

  it("candidates can only withdraw, and only before the application is final", () => {
    for (const from of keys) {
      for (const to of keys) {
        if (from === to) continue;
        const fromFinal = ["joined", "closed", "rejected", "withdrawn"].includes(stage(from).category);
        expect(allowed("candidate", from, to), `${from} → ${to}`).toBe(to === STAGE_KEYS.withdrawn && !fromFinal);
      }
    }
  });

  it("system moves (domain events) may go anywhere but not stay", () => {
    expect(allowed("system", STAGE_KEYS.offerIssued, STAGE_KEYS.offerAccepted)).toBe(true);
    expect(allowed("system", STAGE_KEYS.withdrawn, STAGE_KEYS.submitted)).toBe(true);
  });

  it("refuses retired stages", () => {
    const retired = { ...stage(STAGE_KEYS.shortlisted), isActive: false };
    expect(canTransition("staff", stage(STAGE_KEYS.underReview), retired)).toMatchObject({ allowed: false, reason: "stage_inactive" });
  });

  it("lists allowed targets for menus", () => {
    expect(allowedTargetStages("candidate", stage(STAGE_KEYS.shortlisted), stages).map((s) => s.key)).toEqual([STAGE_KEYS.withdrawn]);
    expect(allowedTargetStages("partner", stage(STAGE_KEYS.shortlisted), stages)).toEqual([]);
    expect(allowedTargetStages("staff", stage(STAGE_KEYS.shortlisted), stages)).toHaveLength(16);
  });

  it("detects forward moves for automatic advancement", () => {
    expect(isForwardMove(stage(STAGE_KEYS.underReview), stage(STAGE_KEYS.interviewScheduled))).toBe(true);
    expect(isForwardMove(stage(STAGE_KEYS.interviewScheduled), stage(STAGE_KEYS.interviewCompleted))).toBe(true);
    expect(isForwardMove(stage(STAGE_KEYS.selected), stage(STAGE_KEYS.interviewScheduled))).toBe(false);
    expect(isForwardMove(stage(STAGE_KEYS.rejected), stage(STAGE_KEYS.offerIssued))).toBe(false);
  });
});

describe("employer pipeline columns (spec 9.5)", () => {
  it("defines the ten candidate columns in order", () => {
    expect(PIPELINE_COLUMNS.map((c) => c.label)).toEqual(["Screening", "Shortlisted", "Trade test", "Client interview", "Selected", "Offer", "Documentation", "Mobilisation", "Joined", "Closed"]);
  });

  it("maps every default stage to a column", () => {
    const mapping = Object.fromEntries(stages.map((s) => [s.key, pipelineColumnForStage(s)]));
    expect(mapping).toEqual({
      submitted: "screening",
      under_review: "screening",
      shortlisted: "shortlisted",
      assessment_pending: "trade_test",
      assessment_completed: "trade_test",
      interview_scheduled: "client_interview",
      interview_completed: "client_interview",
      employer_decision_pending: "client_interview",
      selected: "selected",
      offer_issued: "offer",
      offer_accepted: "offer",
      documentation: "documentation",
      mobilisation: "mobilisation",
      joined: "joined",
      closed: "closed",
      rejected: "closed",
      withdrawn: "closed",
    });
    // Every column's declared stage keys agree with the mapping.
    for (const column of PIPELINE_COLUMNS) for (const key of column.stageKeys) expect(mapping[key]).toBe(column.key);
  });

  it("maps custom stages by category", () => {
    expect(pipelineColumnForStage({ key: "medical_check", category: "pre_joining" })).toBe("documentation");
    expect(pipelineColumnForStage({ key: "welding_6g_test", category: "assessment" })).toBe("trade_test");
    expect(pipelineColumnForStage({ key: "hr_round", category: "interview" })).toBe("client_interview");
    expect(pipelineColumnForStage({ key: "phone_screen", category: "screening" })).toBe("screening");
    expect(pipelineColumnForStage({ key: "shortlisted", category: "rejected" })).toBe("closed");
  });

  it("resolves drop targets per column", () => {
    expect(dropTargetStage(stages, "client_interview")?.key).toBe(STAGE_KEYS.interviewScheduled);
    expect(dropTargetStage(stages, "closed")?.key).toBe(STAGE_KEYS.rejected);
    const custom: StageLike[] = [
      { key: "new", category: "applied", isTerminal: false, sortOrder: 1 },
      { key: "trade", category: "assessment", isTerminal: false, sortOrder: 2 },
    ];
    expect(dropTargetStage(custom, "trade_test")?.key).toBe("trade");
    expect(dropTargetStage(custom, "joined")).toBeUndefined();
  });

  it("resolves automatic-move targets by key, then by category", () => {
    expect(resolveStage(stages, STAGE_KEYS.offerIssued)?.key).toBe(STAGE_KEYS.offerIssued);
    const custom: StageLike[] = [{ key: "client_round", category: "interview", isTerminal: false, sortOrder: 5 }];
    expect(resolveStage(custom, STAGE_KEYS.interviewScheduled, "interview")?.key).toBe("client_round");
    expect(resolveStage(custom, STAGE_KEYS.offerIssued, "offer")).toBeUndefined();
  });

  it("maps requirement statuses to the New / Approved / Sourcing columns", () => {
    expect(requirementPipelineColumn("submitted")).toBe("new");
    expect(requirementPipelineColumn("under_review")).toBe("new");
    expect(requirementPipelineColumn("approved")).toBe("approved");
    expect(requirementPipelineColumn("sourcing")).toBe("sourcing");
    expect(requirementPipelineColumn("partially_filled")).toBe("sourcing");
    expect(requirementPipelineColumn("draft")).toBeNull();
    expect(requirementPipelineColumn("filled")).toBeNull();
  });
});
