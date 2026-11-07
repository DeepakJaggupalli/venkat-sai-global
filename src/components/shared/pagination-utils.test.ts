import { describe, expect, it } from "vitest";

import { pageRange, pageWindow } from "./pagination-utils";

describe("pageWindow", () => {
  it("lists every page when they fit", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows first, last, neighbours and both ellipses in the middle", () => {
    expect(pageWindow(6, 12)).toEqual([1, "ellipsis-start", 5, 6, 7, "ellipsis-end", 12]);
  });

  it("keeps a stable number of slots near the edges", () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 12]);
    expect(pageWindow(12, 12)).toEqual([1, "ellipsis-start", 8, 9, 10, 11, 12]);
    expect(pageWindow(4, 12)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 12]);
    expect(pageWindow(9, 12)).toEqual([1, "ellipsis-start", 8, 9, 10, 11, 12]);
  });

  it("never hides a single page behind an ellipsis", () => {
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 8]);
    expect(pageWindow(5, 8)).toEqual([1, "ellipsis-start", 4, 5, 6, 7, 8]);
  });

  it("clamps out-of-range pages", () => {
    expect(pageWindow(99, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(-2, 0)).toEqual([1]);
  });
});

describe("pageRange", () => {
  it("computes the visible row range", () => {
    expect(pageRange(2, 20, 132)).toEqual({ from: 21, to: 40 });
    expect(pageRange(7, 20, 132)).toEqual({ from: 121, to: 132 });
    expect(pageRange(1, 20, 0)).toEqual({ from: 0, to: 0 });
  });
});
