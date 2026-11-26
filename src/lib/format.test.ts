import { describe, expect, it } from "vitest";

import { initials } from "./format";

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Ravi Kumar")).toBe("RK");
    expect(initials("ravi")).toBe("R");
    expect(initials("  K. Ravi  Kumar ")).toBe("KK");
  });

  it("never cuts an emoji in half or uses a symbol", () => {
    // A lone surrogate ("\ud83d") rendered as "�" and broke hydration on the account page of a name like this.
    const value = initials("<script>alert(1)</script> QA 😀");
    expect(value).toBe("SQ");
    expect(value).not.toMatch(/[\ud800-\udfff]/);
    expect(initials("😀")).toBe("?");
  });

  it("works for Telugu and Arabic names", () => {
    expect(initials("రవి కుమార్")).toBe("రక");
    expect(initials("محمد علي")).toBe("مع");
  });

  it("falls back to a question mark", () => {
    expect(initials(null)).toBe("?");
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
