import { describe, expect, it } from "vitest";

import { buildHref, countActiveParams, distinguishingKeys, isHrefActive, patchSearchParams, toggleValue, toURLSearchParams } from "./url-state";

describe("patchSearchParams", () => {
  it("sets, replaces and deletes keys and resets the page", () => {
    const next = patchSearchParams("q=old&status=draft&page=3", { q: "welder", status: null });
    expect(next.toString()).toBe("q=welder");
  });

  it("treats empty strings and empty arrays as removal", () => {
    expect(patchSearchParams("a=1&b=2", { a: "", b: [] }).toString()).toBe("");
  });

  it("writes repeated keys for arrays and skips blank entries", () => {
    expect(patchSearchParams("", { country: ["AE", "", "QA"] }).getAll("country")).toEqual(["AE", "QA"]);
  });

  it("keeps the page when the patch sets it explicitly", () => {
    expect(patchSearchParams("q=x&page=2", { page: "4" }).toString()).toBe("q=x&page=4");
  });

  it("accepts a leading question mark (window.location.search)", () => {
    expect(patchSearchParams("?sort=title", { dir: "asc" }).toString()).toBe("sort=title&dir=asc");
  });

  it("honours custom reset keys", () => {
    expect(patchSearchParams("cursor=abc&q=a", { q: "b" }, { resetKeys: ["cursor"] }).toString()).toBe("q=b");
  });
});

describe("buildHref", () => {
  it("omits the question mark when there are no params", () => {
    expect(buildHref("/jobs", new URLSearchParams())).toBe("/jobs");
    expect(buildHref("/jobs", new URLSearchParams("q=a"))).toBe("/jobs?q=a");
  });
});

describe("toURLSearchParams", () => {
  it("preserves repeated values and skips undefined", () => {
    expect(toURLSearchParams({ a: ["1", "2"], b: "x", c: undefined }).toString()).toBe("a=1&a=2&b=x");
  });
});

describe("countActiveParams / toggleValue", () => {
  it("counts only non-blank keys from the list", () => {
    expect(countActiveParams(new URLSearchParams("q=&status=draft&from=2026-01-01&other=1"), ["q", "status", "from", "to"])).toBe(2);
  });

  it("toggles a value in a multi-value list", () => {
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleValue(["a"], "c")).toEqual(["a", "c"]);
  });
});

describe("isHrefActive", () => {
  const sp = (q: string) => new URLSearchParams(q);

  it("matches paths exactly by default and ignores trailing slashes", () => {
    expect(isHrefActive("/employer/jobs", "/employer/jobs/", sp(""))).toBe(true);
    expect(isHrefActive("/employer/jobs", "/employer/jobs/123", sp(""))).toBe(false);
  });

  it("supports prefix matching for nested routes", () => {
    expect(isHrefActive("/employer/jobs", "/employer/jobs/123/edit", sp(""), { match: "prefix" })).toBe(true);
    expect(isHrefActive("/employer/jobs", "/employer/jobsboard", sp(""), { match: "prefix" })).toBe(false);
  });

  it("distinguishes sibling tabs by query keys", () => {
    const keys = distinguishingKeys(["/apps", "/apps?status=active", "/apps?status=hired"]);
    expect(keys).toEqual(["status"]);
    expect(isHrefActive("/apps", "/apps", sp("status=active&page=2"), { keys })).toBe(false);
    expect(isHrefActive("/apps?status=active", "/apps", sp("status=active&page=2"), { keys })).toBe(true);
    expect(isHrefActive("/apps", "/apps", sp("page=2"), { keys })).toBe(true);
  });
});
