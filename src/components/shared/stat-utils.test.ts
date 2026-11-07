import { describe, expect, it } from "vitest";

import { avatarTone, orgInitials } from "./avatar-utils";
import { deltaDirection, deltaTone, describeDelta, formatDelta, formatStatValue } from "./stat-utils";
import { addTags } from "./tag-utils";

describe("stat deltas", () => {
  it("derives direction from the sign", () => {
    expect(deltaDirection(0.1)).toBe("up");
    expect(deltaDirection(-3)).toBe("down");
    expect(deltaDirection(0)).toBe("flat");
    expect(deltaDirection(Number.NaN)).toBe("flat");
  });

  it("colours by direction × whether up is good", () => {
    expect(deltaTone("up", "up")).toBe("success");
    expect(deltaTone("up", "down")).toBe("danger");
    expect(deltaTone("down", "down")).toBe("success");
    expect(deltaTone("down", "neutral")).toBe("neutral");
    expect(deltaTone("flat", "up")).toBe("neutral");
  });

  it("formats signed deltas with a true minus sign", () => {
    expect(formatDelta({ value: 0.125 })).toBe("+12.5%");
    expect(formatDelta({ value: -3, format: "number" })).toBe("−3");
    expect(formatDelta({ value: 1.25, format: "points" })).toBe("+1.3 pts");
    expect(formatDelta({ value: 0 })).toBe("0%");
  });

  it("describes deltas for screen readers", () => {
    expect(describeDelta({ value: -0.031, period: "vs last month" })).toBe("Decreased by 3.1% vs last month");
    expect(describeDelta({ value: 0, format: "number" })).toBe("No change");
  });
});

describe("formatStatValue", () => {
  it("keeps full figures below 10,000 and compacts above", () => {
    expect(formatStatValue(1284, { locale: "en-US" })).toBe("1,284");
    expect(formatStatValue(12_900, { locale: "en-US" })).toBe("12.9K");
    expect(formatStatValue(12_900, { locale: "en-US", compact: false })).toBe("12,900");
  });

  it("never invents a number", () => {
    expect(formatStatValue(null)).toBe("—");
    expect(formatStatValue(undefined)).toBe("—");
    expect(formatStatValue(Number.NaN)).toBe("—");
    expect(formatStatValue("4 of 5")).toBe("4 of 5");
  });
});

describe("avatar helpers", () => {
  it("is deterministic per name", () => {
    expect(avatarTone("Sample Person")).toBe(avatarTone("sample person"));
    expect(avatarTone("")).toBe("neutral");
  });

  it("builds organisation initials without filler words", () => {
    expect(orgInitials("Example Co.")).toBe("EC");
    expect(orgInitials("The Sample Works Pvt Ltd")).toBe("SW");
    expect(orgInitials("")).toBe("?");
    expect(orgInitials("వెంకట్ సాయి")).toBe("వస");
  });
});

describe("addTags", () => {
  const opts = { maxTags: 3, maxLength: 10 };

  it("splits lists, trims and caps length", () => {
    expect(addTags([], " TIG , MIG\nStick welding long", opts)).toEqual({ tags: ["TIG", "MIG", "Stick weld"], added: ["TIG", "MIG", "Stick weld"], rejected: null });
  });

  it("ignores duplicates case-insensitively", () => {
    expect(addTags(["TIG"], "tig", opts)).toEqual({ tags: ["TIG"], added: [], rejected: "duplicate" });
  });

  it("stops at the limit", () => {
    expect(addTags(["a", "b", "c"], "d", opts)).toEqual({ tags: ["a", "b", "c"], added: [], rejected: "limit" });
  });

  it("lower-cases when asked and rejects empty input", () => {
    expect(addTags([], "Keyword", { ...opts, lowercase: true }).tags).toEqual(["keyword"]);
    expect(addTags([], " , ", opts).rejected).toBe("empty");
  });
});
