import { describe, expect, it } from "vitest";

import { selectionState, toggleAll, toggleOne } from "./selection";
import type { DataTableColumn } from "./types";
import { alignClass, ariaSort, columnLabel, desktopColumns, isBlank, mobileCardColumns, nextSortDirection, parseSort, resolveSortKey, sortHref } from "./utils";

type Row = { id: string; title: string };
const col = (id: string, extra: Partial<DataTableColumn<Row>> = {}): DataTableColumn<Row> => ({ id, header: id.toUpperCase(), cell: (r) => r.title, ...extra });

describe("column visibility", () => {
  it("drops desktop-hidden columns from the table", () => {
    expect(desktopColumns([col("a"), col("b", { hideOnDesktop: true }), col("c")]).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("uses the first visible column as the card title by default", () => {
    const { primary, fields } = mobileCardColumns([col("select", { hideOnMobile: true }), col("title"), col("status"), col("owner", { hideOnMobile: true })]);
    expect(primary?.id).toBe("title");
    expect(fields.map((c) => c.id)).toEqual(["status"]);
  });

  it("honours an explicit primary column", () => {
    const { primary, fields } = mobileCardColumns([col("code"), col("name", { primary: true }), col("status")]);
    expect(primary?.id).toBe("name");
    expect(fields.map((c) => c.id)).toEqual(["code", "status"]);
  });

  it("labels columns with mobileLabel, string headers or the id", () => {
    expect(columnLabel(col("a", { mobileLabel: "Applicants" }))).toBe("Applicants");
    expect(columnLabel(col("b", { header: "Status" }))).toBe("Status");
    expect(columnLabel(col("c", { header: null }))).toBe("c");
  });

  it("maps alignment to text classes", () => {
    expect(alignClass("right")).toBe("text-right");
    expect(alignClass(undefined)).toBe("text-left");
  });

  it("treats null, empty strings and false as blank but not zero", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank(false)).toBe(true);
    expect(isBlank(0)).toBe(false);
  });
});

describe("sorting", () => {
  it("resolves sort keys", () => {
    expect(resolveSortKey(col("title", { sortKey: true }))).toBe("title");
    expect(resolveSortKey(col("title", { sortKey: "created_at" }))).toBe("created_at");
    expect(resolveSortKey(col("title"))).toBeNull();
  });

  it("validates sort params against a whitelist", () => {
    const fallback = { by: "createdAt" as const, dir: "desc" as const };
    expect(parseSort({ sort: "title", dir: "asc" }, ["createdAt", "title"], fallback)).toEqual({ by: "title", dir: "asc" });
    expect(parseSort({ sort: "password", dir: "asc" }, ["createdAt", "title"], fallback)).toEqual({ by: "createdAt", dir: "asc" });
    expect(parseSort({ sort: "title", dir: "sideways" }, ["createdAt", "title"], fallback)).toEqual({ by: "title", dir: "asc" });
    expect(parseSort(undefined, ["createdAt", "title"], fallback)).toEqual(fallback);
  });

  it("starts ascending and flips the active column", () => {
    expect(nextSortDirection("title", "asc", "createdAt")).toBe("asc");
    expect(nextSortDirection("title", "asc", "title")).toBe("desc");
    expect(nextSortDirection("title", "desc", "title")).toBe("asc");
  });

  it("builds sort links that keep filters and reset the page", () => {
    expect(sortHref("title", { by: "title", dir: "asc", pathname: "/jobs", searchParams: { q: "weld", page: "3" } })).toBe("/jobs?q=weld&sort=title&dir=desc");
  });

  it("reports aria-sort only for sortable columns", () => {
    expect(ariaSort(null, "title", "asc")).toBeUndefined();
    expect(ariaSort("title", "title", "desc")).toBe("descending");
    expect(ariaSort("code", "title", "desc")).toBe("none");
  });
});

describe("selection", () => {
  it("computes none / some / all", () => {
    expect(selectionState(["a", "b"], [])).toBe("none");
    expect(selectionState(["a", "b"], ["a"])).toBe("some");
    expect(selectionState(["a", "b"], ["b", "a", "zzz"])).toBe("all");
    expect(selectionState([], ["a"])).toBe("none");
  });

  it("toggles all and one", () => {
    expect(toggleAll(["a", "b"], ["a"])).toEqual(["a", "b"]);
    expect(toggleAll(["a", "b"], ["a", "b"])).toEqual([]);
    expect(toggleOne(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleOne(["a", "b"], "a")).toEqual(["b"]);
  });
});
