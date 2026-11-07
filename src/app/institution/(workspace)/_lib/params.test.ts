import { describe, expect, it } from "vitest";

import { oneOf, param, uuidParam } from "./params";

describe("institution search params", () => {
  it("reads the first trimmed value", () => {
    expect(param({ q: " weld " }, "q")).toBe("weld");
    expect(param({ q: ["a", "b"] }, "q")).toBe("a");
    expect(param({ q: "  " }, "q")).toBeUndefined();
    expect(param({}, "q")).toBeUndefined();
  });

  it("whitelists enum values", () => {
    const statuses = ["open", "full"] as const;
    expect(oneOf("open", statuses)).toBe("open");
    expect(oneOf("drop table", statuses)).toBeUndefined();
    expect(oneOf(undefined, statuses)).toBeUndefined();
  });

  it("accepts only uuids", () => {
    expect(uuidParam("6F9619FF-8B86-D011-B42D-00C04FC964FF")).toBe("6f9619ff-8b86-d011-b42d-00c04fc964ff");
    expect(uuidParam("1' or 1=1")).toBeUndefined();
  });
});
