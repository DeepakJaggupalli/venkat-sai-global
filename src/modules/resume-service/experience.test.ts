import { describe, expect, it } from "vitest";

import { experienceMonths, formatDateDots, formatExperienceTotal, periodTo } from "./experience";

const today = new Date("2026-11-08T10:00:00.000Z");

describe("formatDateDots", () => {
  it("formats ISO dates as dd.mm.yyyy", () => {
    expect(formatDateDots("2024-03-07")).toBe("07.03.2024");
    expect(formatDateDots("")).toBe("");
    expect(formatDateDots(null)).toBe("");
    expect(formatDateDots(undefined)).toBe("");
  });
});

describe("periodTo", () => {
  it("prints Still Continue for a current job", () => {
    expect(periodTo({ current: true, to: undefined })).toBe("Still Continue");
    expect(periodTo({ current: false, to: "2023-12-31" })).toBe("31.12.2023");
  });
});

describe("experienceMonths", () => {
  it("counts inclusive whole years", () => {
    expect(experienceMonths([{ from: "2020-01-01", to: "2022-12-31", current: false }], today)).toBe(36);
  });

  it("rounds a remainder of 15 days or more up to a month", () => {
    // 1 Jan → 15 Feb inclusive = 1 month 15 days → 2 months
    expect(experienceMonths([{ from: "2024-01-01", to: "2024-02-15", current: false }], today)).toBe(2);
    // 1 Jan → 10 Feb inclusive = 1 month 10 days → 1 month
    expect(experienceMonths([{ from: "2024-01-01", to: "2024-02-10", current: false }], today)).toBe(1);
  });

  it("merges overlapping and back-to-back periods", () => {
    const rows = [
      { from: "2018-01-01", to: "2019-12-31", current: false },
      { from: "2019-06-01", to: "2020-12-31", current: false }, // overlaps the first
      { from: "2021-01-01", to: "2021-06-30", current: false }, // starts the day after
    ];
    expect(experienceMonths(rows, today)).toBe(42);
  });

  it("runs current jobs to today and ignores reversed or missing dates", () => {
    expect(experienceMonths([{ from: "2023-10-09", current: true }], today)).toBe(37);
    expect(experienceMonths([{ from: "2024-05-01", to: "2023-01-01", current: false }], today)).toBe(0);
    expect(experienceMonths([{ from: "2024-05-01", current: false }], today)).toBe(0);
  });

  it("adds separate periods", () => {
    const rows = [
      { from: "2015-01-01", to: "2016-12-31", current: false },
      { from: "2019-01-01", to: "2020-01-31", current: false },
    ];
    expect(formatExperienceTotal(experienceMonths(rows, today), "title")).toBe("03 Years 1 Month");
  });
});

describe("formatExperienceTotal", () => {
  it("formats title and upper styles", () => {
    expect(formatExperienceTotal(37, "title")).toBe("03 Years 1 Month");
    expect(formatExperienceTotal(12, "title")).toBe("01 Year");
    expect(formatExperienceTotal(5, "title")).toBe("5 Months");
    expect(formatExperienceTotal(1, "title")).toBe("1 Month");
    expect(formatExperienceTotal(96, "upper")).toBe("08 YEARS");
    expect(formatExperienceTotal(98, "upper")).toBe("08 YEARS 2 MONTHS");
    expect(formatExperienceTotal(0, "title")).toBe("");
  });
});
