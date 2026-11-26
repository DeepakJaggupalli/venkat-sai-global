import { describe, expect, it } from "vitest";

import { ActionError } from "@/lib/actions";

import { assertJoiningDateNotPast } from "./requirement-dates";

describe("assertJoiningDateNotPast", () => {
  const now = new Date("2026-11-26T08:00:00.000Z");

  it("allows no date, today, tomorrow and yesterday (time-zone slack)", () => {
    for (const day of [null, undefined, "2026-11-26", "2026-11-27", "2026-11-25"]) {
      expect(() => assertJoiningDateNotPast(day, now)).not.toThrow();
    }
  });

  it("rejects a day that has clearly passed, with a field error on joiningBy", () => {
    try {
      assertJoiningDateNotPast("2020-01-01", now);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ActionError);
      expect((error as ActionError).fieldErrors?.joiningBy).toEqual(["Choose today or a later date"]);
    }
  });
});
