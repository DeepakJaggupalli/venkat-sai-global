import { describe, expect, it } from "vitest";


import {
  collectAssetIds,
  type EditorField,
  countErrorsUnder,
  describeValue,
  emptyObjectFor,
  fromDatetimeLocal,
  getAt,
  listItemTitle,
  moveItem,
  setAt,
  toDatetimeLocal,
} from "./field-utils";

const listField = {
  name: "faqs",
  type: "list",
  label: "FAQs",
  required: false,
  itemLabel: "Question",
  titleField: "question",
  fields: [
    { name: "question", type: "text", label: "Question", required: true },
    { name: "image", type: "asset", label: "Image", required: false },
  ],
} as unknown as EditorField;

describe("setAt / getAt", () => {
  it("writes nested values immutably", () => {
    const before = { faqs: [{ question: "a" }] };
    const after = setAt(before, ["faqs", 0, "question"], "b");
    expect(getAt(after, ["faqs", 0, "question"])).toBe("b");
    expect(before.faqs[0]!.question).toBe("a");
  });
  it("creates missing containers and removes undefined keys", () => {
    expect(setAt({}, ["hero", "heading"], "Hi")).toEqual({ hero: { heading: "Hi" } });
    expect(setAt({ a: 1, b: 2 }, ["a"], undefined)).toEqual({ b: 2 });
  });
});

describe("moveItem", () => {
  it("moves within bounds and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("errors", () => {
  it("counts errors below a key", () => {
    expect(countErrorsUnder({ "data.faqs.0.question": ["x"], "data.faqs.1.question": ["y"], "data.other": ["z"] }, "data.faqs")).toBe(2);
    expect(countErrorsUnder({ "data.faqsx": ["x"] }, "data.faqs")).toBe(0);
  });
});

describe("listItemTitle", () => {
  it("uses the title field or falls back to a numbered label", () => {
    expect(listItemTitle({ question: "Do you charge candidates?" }, listField, 0)).toBe("Do you charge candidates?");
    expect(listItemTitle({}, listField, 2)).toBe("Question 3");
  });
});

describe("emptyObjectFor", () => {
  it("only includes fields with a meaningful default", () => {
    const fields = [
      { name: "visible", type: "boolean", label: "Visible", required: false, defaultValue: true },
      { name: "tags", type: "textlist", label: "Tags", required: false },
      { name: "title", type: "text", label: "Title", required: false },
    ] as unknown as EditorField[];
    expect(emptyObjectFor(fields)).toEqual({ visible: true, tags: [] });
  });
});

describe("datetime-local conversion", () => {
  it("round-trips through ISO", () => {
    const local = "2026-11-07T09:30";
    const iso = fromDatetimeLocal(local)!;
    expect(toDatetimeLocal(iso)).toBe(local);
    expect(fromDatetimeLocal("")).toBeUndefined();
  });
});

describe("describeValue", () => {
  it("renders rich text as plain text and summarises lists", () => {
    expect(describeValue("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    expect(describeValue(true)).toBe("Yes");
    expect(describeValue([])).toBe("(empty)");
    expect(describeValue([{ q: "a" }, { q: "b" }])).toBe("2 items: q: a · q: b");
  });
});

describe("collectAssetIds", () => {
  it("walks nested lists", () => {
    const fields = [listField, { name: "hero", type: "asset", label: "Hero", required: false }] as unknown as EditorField[];
    const ids = collectAssetIds(fields, { hero: "h1", faqs: [{ image: "i1" }, { image: "i2" }] });
    expect([...ids].sort()).toEqual(["h1", "i1", "i2"]);
  });
});
