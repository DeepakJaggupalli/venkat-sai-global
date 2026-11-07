import { describe, expect, it } from "vitest";

import { columnItems, countByColumn, indexInColumn, isNoopMove, moveItem } from "./kanban-utils";

const items = [
  { id: "a", columnId: "applied" },
  { id: "b", columnId: "applied" },
  { id: "c", columnId: "interview" },
  { id: "d", columnId: "applied" },
];
const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe("moveItem", () => {
  it("moves to another column at a position", () => {
    const next = moveItem(items, "a", "interview", 0);
    expect(ids(columnItems(next, "interview"))).toEqual(["a", "c"]);
    expect(ids(columnItems(next, "applied"))).toEqual(["b", "d"]);
  });

  it("appends when the index is past the end (or Infinity-like)", () => {
    expect(ids(columnItems(moveItem(items, "a", "interview", Number.MAX_SAFE_INTEGER), "interview"))).toEqual(["c", "a"]);
  });

  it("moves into an empty column", () => {
    const next = moveItem(items, "c", "offer", 0);
    expect(columnItems(next, "offer")).toEqual([{ id: "c", columnId: "offer" }]);
  });

  it("reorders within a column like arrayMove", () => {
    expect(ids(columnItems(moveItem(items, "a", "applied", 2), "applied"))).toEqual(["b", "d", "a"]);
    expect(ids(columnItems(moveItem(items, "d", "applied", 0), "applied"))).toEqual(["d", "a", "b"]);
  });

  it("does not mutate the input and ignores unknown ids", () => {
    const copy = structuredClone(items);
    moveItem(items, "a", "interview", 0);
    expect(items).toEqual(copy);
    expect(moveItem(items, "zzz", "interview", 0)).toEqual(items);
  });
});

describe("board helpers", () => {
  it("finds positions and detects no-op moves", () => {
    expect(indexInColumn(items, "d")).toBe(2);
    expect(indexInColumn(items, "nope")).toBe(-1);
    expect(isNoopMove(items, { itemId: "b", fromColumnId: "applied", toColumnId: "applied", toIndex: 1 })).toBe(true);
    expect(isNoopMove(items, { itemId: "b", fromColumnId: "applied", toColumnId: "interview", toIndex: 0 })).toBe(false);
  });

  it("counts per column including empty ones", () => {
    expect(countByColumn(items, ["applied", "interview", "offer"])).toEqual({ applied: 3, interview: 1, offer: 0 });
  });
});
