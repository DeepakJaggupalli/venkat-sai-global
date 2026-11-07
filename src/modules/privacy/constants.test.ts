import { describe, expect, it } from "vitest";

import {
  canTransitionDataRequest,
  CLOSE_ACCOUNT_MARKER,
  computeDataRequestDueAt,
  dataRequestSlaState,
  EXPORT_LINK_DAYS,
  exportExpiresAt,
  isExportExpired,
  parseCloseAccountMarker,
} from "./constants";

const DAY = 86_400_000;

describe("privacy constants", () => {
  it("computes the due date from the configured number of days", () => {
    const created = new Date("2026-11-01T10:00:00Z");
    expect(computeDataRequestDueAt(created, 30).toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(computeDataRequestDueAt(created, 7).getTime() - created.getTime()).toBe(7 * DAY);
  });

  it("falls back to 30 days for invalid settings", () => {
    const created = new Date("2026-11-01T00:00:00Z");
    expect(computeDataRequestDueAt(created, Number.NaN).getTime() - created.getTime()).toBe(30 * DAY);
    expect(computeDataRequestDueAt(created, 0).getTime() - created.getTime()).toBe(30 * DAY);
  });

  it("classifies the SLA state", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(dataRequestSlaState({ status: "completed", dueAt: new Date(now.getTime() - DAY) }, now)).toBe("closed");
    expect(dataRequestSlaState({ status: "received", dueAt: null }, now)).toBe("none");
    expect(dataRequestSlaState({ status: "in_progress", dueAt: new Date(now.getTime() - 1) }, now)).toBe("overdue");
    expect(dataRequestSlaState({ status: "in_progress", dueAt: new Date(now.getTime() + 2 * DAY) }, now)).toBe("due_soon");
    expect(dataRequestSlaState({ status: "received", dueAt: new Date(now.getTime() + 10 * DAY) }, now)).toBe("on_track");
  });

  it("enforces the staff state machine", () => {
    expect(canTransitionDataRequest("received", "in_progress")).toBe(true);
    expect(canTransitionDataRequest("identity_verification", "in_progress")).toBe(true);
    expect(canTransitionDataRequest("in_progress", "completed")).toBe(true);
    expect(canTransitionDataRequest("received", "completed")).toBe(false);
    expect(canTransitionDataRequest("completed", "in_progress")).toBe(false);
    expect(canTransitionDataRequest("cancelled", "received")).toBe(false);
  });

  it("expires export links after the window", () => {
    const generated = new Date("2026-11-01T00:00:00Z");
    expect(exportExpiresAt(generated).getTime() - generated.getTime()).toBe(EXPORT_LINK_DAYS * DAY);
    expect(isExportExpired(generated, new Date(generated.getTime() + DAY))).toBe(false);
    expect(isExportExpired(generated, new Date(generated.getTime() + EXPORT_LINK_DAYS * DAY))).toBe(true);
    expect(isExportExpired(null)).toBe(true);
  });

  it("reads the close-account marker written by the People Portal", () => {
    expect(parseCloseAccountMarker(null)).toEqual({ closeAccount: false, text: null });
    expect(parseCloseAccountMarker(`${CLOSE_ACCOUNT_MARKER} The person asked to close their account.\n\nPlease remove my CV`)).toEqual({
      closeAccount: true,
      text: "Please remove my CV",
    });
    expect(parseCloseAccountMarker("Fix my surname")).toEqual({ closeAccount: false, text: "Fix my surname" });
  });
});
