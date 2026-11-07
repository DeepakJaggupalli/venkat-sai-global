import { describe, expect, it } from "vitest";

import { escapeLike, firstIssue, jobCategorySearchSchema, pickParams, skillSearchSchema } from "./params";

const parse = (qs: string) => skillSearchSchema.safeParse(pickParams(new URLSearchParams(qs), ["q", "category", "limit"]));

describe("skillSearchSchema", () => {
  it("applies defaults and trims the query", () => {
    const r = parse("q=%20%20tig%20");
    expect(r.success && r.data).toEqual({ q: "tig", category: undefined, limit: 15 });
  });

  it("treats a blank category or limit as absent", () => {
    const r = parse("q=weld&category=&limit=");
    expect(r.success && r.data).toEqual({ q: "weld", category: undefined, limit: 15 });
  });

  it("accepts known categories and limits up to 25", () => {
    expect(parse("q=weld&category=trade&limit=25").success).toBe(true);
  });

  it("rejects unknown categories, large limits and long queries", () => {
    const badCategory = parse("q=weld&category=magic");
    expect(badCategory.success).toBe(false);
    if (!badCategory.success) expect(firstIssue(badCategory.error)).toBe("Unknown skill category");
    expect(parse("q=weld&limit=26").success).toBe(false);
    expect(parse("q=weld&limit=abc").success).toBe(false);
    expect(parse(`q=${"x".repeat(81)}`).success).toBe(false);
  });

  it("allows a missing query (the route returns no items)", () => {
    const r = parse("");
    expect(r.success && r.data.q).toBe("");
  });
});

describe("jobCategorySearchSchema", () => {
  it("defaults to 20 and caps at 50", () => {
    const ok = jobCategorySearchSchema.safeParse({ q: "weld" });
    expect(ok.success && ok.data.limit).toBe(20);
    expect(jobCategorySearchSchema.safeParse({ q: "weld", limit: "51" }).success).toBe(false);
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and backslashes", () => {
    expect(escapeLike("100%_done\\x")).toBe("100\\%\\_done\\\\x");
  });
});
