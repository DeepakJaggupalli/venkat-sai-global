import { describe, expect, it } from "vitest";

import { buildSetupChecklist, checklistProgress, type SetupChecklistInput } from "./setup-checklist";

const base: SetupChecklistInput = {
  orgStatus: "draft",
  hasCompanyDetails: false,
  hasLogo: false,
  hasAbout: false,
  documentRequirementsMet: false,
  memberCount: 1,
  pendingInvitationCount: 0,
  jobCount: 0,
  requirementCount: 0,
  can: { company: true, team: true, jobs: true, requirements: true },
};

describe("buildSetupChecklist", () => {
  it("lists every step for an owner of a new workspace, none done", () => {
    const items = buildSetupChecklist(base);
    expect(items.map((i) => i.id)).toEqual(["details", "branding", "documents", "verification", "team", "job"]);
    expect(checklistProgress(items)).toEqual({ done: 0, total: 6, complete: false });
  });

  it("treats a submitted verification as documents uploaded", () => {
    const items = buildSetupChecklist({ ...base, orgStatus: "pending" });
    expect(items.find((i) => i.id === "documents")?.done).toBe(true);
    expect(items.find((i) => i.id === "verification")?.done).toBe(true);
  });

  it("counts pending invitations as inviting the team", () => {
    const items = buildSetupChecklist({ ...base, pendingInvitationCount: 1 });
    expect(items.find((i) => i.id === "team")?.done).toBe(true);
  });

  it("hides steps the member cannot act on and offers a requirement instead of a job", () => {
    const items = buildSetupChecklist({ ...base, can: { company: false, team: false, jobs: false, requirements: true } });
    expect(items.map((i) => i.id)).toEqual(["requirement"]);
  });

  it("reports completion", () => {
    const items = buildSetupChecklist({
      ...base,
      orgStatus: "verified",
      hasCompanyDetails: true,
      hasLogo: true,
      hasAbout: true,
      memberCount: 3,
      jobCount: 2,
    });
    expect(checklistProgress(items).complete).toBe(true);
  });

  it("is never complete when there are no steps", () => {
    expect(checklistProgress([]).complete).toBe(false);
  });
});
