import { describe, expect, it } from "vitest";

import { screeningQuestionSchema } from "@/modules/jobs/schemas";

import { anyOfFromLabels, draftOptions, fitKnockout, knockoutLabels, listErrors, optionValue, serializeQuestions, type ScreeningDraft } from "./screening";

const draft = (over: Partial<ScreeningDraft>): ScreeningDraft => ({
  key: "k",
  question: "Do you hold a valid passport?",
  helpText: "",
  type: "yes_no",
  optionLabels: [],
  isRequired: true,
  knockout: null,
  ...over,
});

describe("optionValue", () => {
  it("slugifies and de-duplicates", () => {
    expect(optionValue("Yes, 5+ years", new Set())).toBe("yes-5-years");
    expect(optionValue("Yes", new Set(["yes"]))).toBe("yes-2");
    expect(optionValue("!!!", new Set())).toBe("option");
  });
});

describe("draftOptions", () => {
  it("skips blank labels and keeps values unique", () => {
    expect(draftOptions(["6G", " ", "6g", "TIG"])).toEqual([
      { value: "6g", label: "6G" },
      { value: "6g-2", label: "6g" },
      { value: "tig", label: "TIG" },
    ]);
  });
});

describe("fitKnockout", () => {
  it("keeps only rules that fit the type", () => {
    expect(fitKnockout("yes_no", { kind: "equals", value: false }, [])).toEqual({ kind: "equals", value: false });
    expect(fitKnockout("yes_no", { kind: "below", value: 2 }, [])).toBeNull();
    expect(fitKnockout("number", { kind: "below", value: 3 }, [])).toEqual({ kind: "below", value: 3 });
    expect(fitKnockout("text", { kind: "equals", value: "x" }, [])).toBeNull();
    expect(fitKnockout("single_choice", { kind: "any_of", values: ["a", "gone"] }, [{ value: "a", label: "A" }])).toEqual({ kind: "any_of", values: ["a"] });
    expect(fitKnockout("multi_choice", { kind: "any_of", values: ["gone"] }, [{ value: "a", label: "A" }])).toBeNull();
  });
});

describe("serializeQuestions", () => {
  it("produces payloads the jobs schema accepts", () => {
    const payload = serializeQuestions([
      draft({ knockout: { kind: "equals", value: false } }),
      draft({ key: "2", question: "Which welding positions are you qualified in?", type: "multi_choice", optionLabels: ["3G", "6G", ""], knockout: anyOfFromLabels(["3G"], ["3G", "6G"]) }),
      draft({ key: "3", question: "Years of pipe welding experience", type: "number", knockout: { kind: "below", value: 2 } }),
      draft({ key: "4", question: "Tell us about your last project", type: "text", isRequired: false, id: "6f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f" }),
    ]);
    for (const q of payload) expect(screeningQuestionSchema.safeParse(q).success).toBe(true);
    expect(payload[1]!.options).toEqual([
      { value: "3g", label: "3G" },
      { value: "6g", label: "6G" },
    ]);
    expect(payload[3]).toMatchObject({ id: "6f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f", helpText: null, options: [] });
  });
});

describe("knockoutLabels", () => {
  it("maps stored values back to labels", () => {
    expect(knockoutLabels({ kind: "any_of", values: ["b"] }, [{ value: "a", label: "A" }, { value: "b", label: "B" }])).toEqual(["B"]);
    expect(knockoutLabels(null, [])).toEqual([]);
  });
});

describe("listErrors", () => {
  it("collects nested list errors with their index", () => {
    expect(listErrors({ "screeningQuestions.1.question": ["Write the question"], title: ["x"], screeningQuestions: ["Add at least one"] }, "screeningQuestions")).toEqual([
      { index: 1, message: "Write the question" },
      { index: null, message: "Add at least one" },
    ]);
  });
});
