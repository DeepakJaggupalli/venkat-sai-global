import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createAction, createFormAction } from "./actions";
import { f, isCalendarDay, MAX_AMOUNT } from "./validation";

describe("isCalendarDay", () => {
  it("accepts real days, including 29 February in a leap year", () => {
    expect(isCalendarDay("2026-11-26")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
  });

  it("rejects impossible days that a hand-made request could send", () => {
    for (const value of ["2026-13-01", "2026-00-10", "2026-02-31", "2026-02-29", "9999-99-99", "2026-11-26T00:00"]) {
      expect(isCalendarDay(value), value).toBe(false);
    }
  });
});

describe("f.date / f.optionalDate", () => {
  it("parse a real day to UTC midnight", () => {
    expect(f.date().parse("2026-11-26").toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(f.optionalDate().parse(undefined)).toBeUndefined();
  });

  it("give a field error for an impossible day instead of an Invalid Date", () => {
    const result = f.optionalDate().safeParse("2026-13-01");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid date");
    // Rolled-over days are rejected too, so 31 February never becomes 3 March.
    expect(f.date().safeParse("2026-02-31").success).toBe(false);
  });

  it("keep a chained toISOString() transform from throwing (employer requirement joiningBy)", () => {
    const schema = z.object({ joiningBy: f.optionalDate().transform((d) => (d ? d.toISOString().slice(0, 10) : undefined)) });
    expect(() => schema.safeParse({ joiningBy: "2026-13-01" })).not.toThrow();
    expect(schema.safeParse({ joiningBy: "2026-13-01" }).success).toBe(false);
  });
});

describe("server action input parsing", () => {
  const throwing = z.object({ value: z.string().transform(() => new Date("bad").toISOString()) });

  it("createFormAction returns a friendly error when a transform throws", async () => {
    const action = createFormAction(throwing, async () => undefined);
    const fd = new FormData();
    fd.set("value", "x");
    await expect(action(null, fd)).resolves.toEqual({ ok: false, error: "Please check the form and try again." });
  });

  it("createAction returns a friendly error when a transform throws", async () => {
    const action = createAction(throwing, async () => undefined);
    await expect(action({ value: "x" })).resolves.toEqual({ ok: false, error: "Invalid request." });
  });
});

describe("f.amount / f.optionalAmount", () => {
  it("accept ordinary amounts and blanks", () => {
    expect(f.amount().parse("1250.50")).toBe(1250.5);
    expect(f.optionalAmount().parse("")).toBeUndefined();
  });

  it("reject negative, huge and non-numeric amounts with plain messages", () => {
    expect(f.optionalAmount().safeParse("-5").error?.issues[0]?.message).toBe("Amount cannot be negative");
    expect(f.optionalAmount().safeParse("1e300").error?.issues[0]?.message).toBe("Amount is too large");
    expect(f.amount().safeParse(String(MAX_AMOUNT + 1)).error?.issues[0]?.message).toBe("Amount is too large");
    expect(f.optionalAmount().safeParse("abc").error?.issues[0]?.message).toBe("Enter an amount");
    expect(f.optionalAmount().safeParse(String(MAX_AMOUNT)).success).toBe(true);
  });
});

describe("f.int / f.optionalInt", () => {
  it("explain the allowed range in plain words", () => {
    expect(f.int({ min: 1, max: 100 }).safeParse("-5").error?.issues[0]?.message).toBe("Enter 1 or more");
    expect(f.int({ min: 1, max: 100 }).safeParse("500").error?.issues[0]?.message).toBe("Enter 100 or less");
    expect(f.optionalInt({ min: 1, max: 600 }).safeParse("-3").error?.issues[0]?.message).toBe("Enter 1 or more");
    expect(f.optionalInt({ min: 1 }).safeParse("abc").error?.issues[0]?.message).toBe("Enter a number");
    expect(f.optionalInt({ min: 1 }).safeParse("2.5").error?.issues[0]?.message).toBe("Enter a whole number");
    expect(f.optionalInt({ min: 1 }).parse("")).toBeUndefined();
  });
});
