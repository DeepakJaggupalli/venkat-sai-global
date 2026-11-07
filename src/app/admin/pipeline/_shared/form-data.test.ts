import { describe, expect, it } from "vitest";

import { formBool, formList, formNumber, formPatch, formText } from "./form-data";
import { humanize, statusTone } from "./status";

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("form-data readers", () => {
  it("reads trimmed text and treats blanks as missing", () => {
    const f = fd([["a", "  hello "], ["b", "   "]]);
    expect(formText(f, "a")).toBe("hello");
    expect(formText(f, "b")).toBeUndefined();
    expect(formText(f, "c")).toBeUndefined();
  });

  it("uses patch semantics: absent keeps, blank clears", () => {
    const f = fd([["visaType", ""], ["notes", " x "]]);
    expect(formPatch(f, "visaType")).toBeNull();
    expect(formPatch(f, "notes")).toBe("x");
    expect(formPatch(f, "travelDate")).toBeUndefined();
  });

  it("reads checkboxes with a hidden false fallback", () => {
    expect(formBool(fd([["x", "false"], ["x", "true"]]), "x")).toBe(true);
    expect(formBool(fd([["x", "false"]]), "x")).toBe(false);
    expect(formBool(fd([["x", "on"]]), "x")).toBe(true);
    expect(formBool(fd([]), "x")).toBe(false);
  });

  it("collects repeated values without duplicates or blanks", () => {
    const f = fd([["ids[]", "a"], ["ids[]", "b"], ["ids[]", "a"], ["ids[]", " "]]);
    expect(formList(f, "ids")).toEqual(["a", "b"]);
  });

  it("parses numbers", () => {
    expect(formNumber(fd([["n", "12.5"]]), "n")).toBe(12.5);
    expect(formNumber(fd([["n", "abc"]]), "n")).toBeUndefined();
    expect(formNumber(fd([]), "n")).toBeUndefined();
  });
});

describe("status helpers", () => {
  it("maps lifecycle values to tones", () => {
    expect(statusTone("verified")).toBe("success");
    expect(statusTone("rejected")).toBe("danger");
    expect(statusTone("pending")).toBe("warning");
    expect(statusTone("visa_processing")).toBe("info");
    expect(statusTone("something_else")).toBe("neutral");
    expect(statusTone(null)).toBe("neutral");
  });

  it("humanises keys", () => {
    expect(humanize("emigration_clearance")).toBe("Emigration clearance");
    expect(humanize(null)).toBe("—");
  });
});
