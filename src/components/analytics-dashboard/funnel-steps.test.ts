import { describe, expect, it } from "vitest";

import { formatProps, moveStep, parseProps, toDraft, toPayload } from "./funnel-steps";

describe("funnel builder helpers", () => {
  it("parses and formats property filters", () => {
    expect(parseProps("intent=employer, orgType = employer")).toEqual({ intent: "employer", orgType: "employer" });
    expect(parseProps("overseas=true\nbad, =x, y=")).toEqual({ overseas: true });
    expect(parseProps("")).toBeUndefined();
    expect(formatProps({ intent: "candidate", overseas: false })).toBe("intent=candidate, overseas=false");
  });

  it("round-trips a stored step", () => {
    const draft = toDraft({ label: "Employer registration", match: { event: "registration_completed", props: { intent: "employer" } } });
    expect(toPayload(draft)).toEqual({ label: "Employer registration", event: "registration_completed", props: { intent: "employer" } });
    expect(toPayload({ key: "k", label: " Jobs ", event: "", path: " /jobs/* ", props: "" })).toEqual({ label: "Jobs", path: "/jobs/*" });
  });

  it("moves steps within bounds", () => {
    expect(moveStep(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveStep(["a", "b", "c"], 2, 3)).toEqual(["a", "b", "c"]);
  });
});
