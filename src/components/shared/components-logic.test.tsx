import { describe, expect, it } from "vitest";

import { fileKind } from "./file-list";
import { clampPercent, completeness } from "./progress-ring";
import { normalizeEditorHtml, normalizeLinkUrl } from "./rich-text-utils";
import { resolveStepStates } from "./stepper";

describe("resolveStepStates", () => {
  const steps = [{ id: "details", label: "Details" }, { id: "documents", label: "Documents" }, { id: "review", label: "Review" }];

  it("marks steps before the current one complete by default", () => {
    expect(resolveStepStates(steps, "documents")).toEqual(["complete", "current", "upcoming"]);
    expect(resolveStepStates(steps, 0)).toEqual(["current", "upcoming", "upcoming"]);
  });

  it("uses explicit completion when given", () => {
    expect(resolveStepStates(steps, "details", ["review"])).toEqual(["current", "upcoming", "complete"]);
  });
});

describe("progress helpers", () => {
  it("clamps and rounds percentages", () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(66.6)).toBe(67);
    expect(clampPercent(null)).toBe(0);
  });

  it("computes completeness from items", () => {
    expect(completeness([])).toBe(0);
    expect(completeness([{ id: "a", label: "A", done: true }, { id: "b", label: "B", done: false }, { id: "c", label: "C", done: true }])).toBe(67);
  });
});

describe("fileKind", () => {
  it("classifies by MIME type and extension", () => {
    expect(fileKind("application/pdf", "cv").label).toBe("PDF");
    expect(fileKind(null, "photo.JPG").label).toBe("JPG");
    expect(fileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "list.xlsx").label).toBe("XLSX");
    expect(fileKind(null, "README").label).toBe("File");
  });
});

describe("rich text helpers", () => {
  it("accepts safe link targets and normalises bare input", () => {
    expect(normalizeLinkUrl("https://example.com/jobs")).toBe("https://example.com/jobs");
    expect(normalizeLinkUrl("example.com/apply")).toBe("https://example.com/apply");
    expect(normalizeLinkUrl("hello@example.com")).toBe("mailto:hello@example.com");
    expect(normalizeLinkUrl("tel:+911234567890")).toBe("tel:+911234567890");
  });

  it("rejects unsafe or meaningless input", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("data:text/html;base64,AAAA")).toBeNull();
    expect(normalizeLinkUrl("not a link")).toBeNull();
    expect(normalizeLinkUrl("https://intranet")).toBeNull();
    expect(normalizeLinkUrl("   ")).toBeNull();
  });

  it("treats an empty document as an empty value", () => {
    expect(normalizeEditorHtml("<p></p>", true)).toBe("");
    expect(normalizeEditorHtml("<p></p>", false)).toBe("");
    expect(normalizeEditorHtml(" <p>Hi</p> ", false)).toBe("<p>Hi</p>");
  });
});
