import { describe, expect, it } from "vitest";

import { DEFAULT_PRIVACY_FLAGS } from "@/modules/candidates/policy";

import { parsePreviewScenario, previewAccess, previewName } from "./employer-preview";

const base = { visibility: "public_to_employers" as const, isOpenToWork: true, privacy: DEFAULT_PRIVACY_FLAGS, restrictedMinor: false };

describe("employer preview", () => {
  it("masks the name, contact and documents for a searching employer by default", () => {
    const access = previewAccess(base, "search");
    expect(access.canView).toBe(true);
    expect(access.fullName).toBe(false);
    expect(access.contact).toBe("none");
    expect(access.documents).toBe("none");
    expect(previewName("Ravi Kumar Reddy", access)).toBe("R. R.");
  });

  it("shares name, resume and shareable documents with an employer the candidate applied to", () => {
    const access = previewAccess(base, "applied");
    expect(access.fullName).toBe(true);
    expect(access.resume).toBe(true);
    expect(access.documents).toBe("shareable");
    expect(access.contact).toBe("on_reveal");
  });

  it("hides the profile from search when it is not discoverable, and always for a restricted minor", () => {
    expect(previewAccess({ ...base, visibility: "venkat_sai_only" }, "search").canView).toBe(false);
    expect(previewAccess({ ...base, isOpenToWork: false }, "search").canView).toBe(false);
    expect(previewAccess({ ...base, restrictedMinor: true }, "applied").denial).toBe("minor_restricted");
  });

  it("parses the scenario defensively", () => {
    expect(parsePreviewScenario("applied")).toBe("applied");
    expect(parsePreviewScenario("anything")).toBe("search");
    expect(parsePreviewScenario(undefined)).toBe("search");
  });
});
