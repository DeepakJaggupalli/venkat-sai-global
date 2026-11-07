import { describe, expect, it } from "vitest";

import { fieldErrorsFor, formErrorOf, interpretOutcome, isActionResult, isNavigationError, listFieldErrors } from "./action-result";

const failure = { ok: false as const, error: "Please correct the highlighted fields.", fieldErrors: { title: ["Title is required"], skills: ["Choose at least one skill"], _form: ["Form-level issue"] } };

describe("fieldErrorsFor", () => {
  it("reads errors by name and maps array inputs", () => {
    expect(fieldErrorsFor(failure, "title")).toEqual(["Title is required"]);
    expect(fieldErrorsFor(failure, "skills[]")).toEqual(["Choose at least one skill"]);
  });

  it("returns undefined for success, null state or unknown fields", () => {
    expect(fieldErrorsFor(null, "title")).toBeUndefined();
    expect(fieldErrorsFor({ ok: true }, "title")).toBeUndefined();
    expect(fieldErrorsFor(failure, "missing")).toBeUndefined();
    expect(fieldErrorsFor(failure, undefined)).toBeUndefined();
  });
});

describe("formErrorOf / listFieldErrors", () => {
  it("prefers the action's error message", () => {
    expect(formErrorOf(failure)).toBe("Please correct the highlighted fields.");
    expect(formErrorOf({ ok: false, error: "", fieldErrors: { _form: ["Dates overlap"] } })).toBe("Dates overlap");
    expect(formErrorOf({ ok: true, message: "Saved" })).toBeUndefined();
  });

  it("lists field errors without the form bucket", () => {
    expect(listFieldErrors(failure.fieldErrors).map((e) => e.name)).toEqual(["title", "skills"]);
    expect(listFieldErrors(undefined)).toEqual([]);
  });
});

describe("interpretOutcome", () => {
  it("normalises callback results", () => {
    expect(interpretOutcome(undefined)).toEqual({ ok: true });
    expect(interpretOutcome(true)).toEqual({ ok: true });
    expect(interpretOutcome({ ok: true, message: "Moved" })).toEqual({ ok: true, message: "Moved" });
    expect(interpretOutcome({ ok: false, error: "Not allowed" })).toEqual({ ok: false, error: "Not allowed" });
    expect(interpretOutcome(false)).toMatchObject({ ok: false });
  });

  it("recognises ActionResult shapes", () => {
    expect(isActionResult({ ok: true })).toBe(true);
    expect(isActionResult({ ok: "yes" })).toBe(false);
    expect(isActionResult(null)).toBe(false);
  });
});

describe("isNavigationError", () => {
  it("only matches Next.js control-flow digests", () => {
    expect(isNavigationError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" }))).toBe(true);
    expect(isNavigationError(Object.assign(new Error("boom"), { digest: "3049213848" }))).toBe(false);
    expect(isNavigationError(new Error("plain"))).toBe(false);
  });
});
