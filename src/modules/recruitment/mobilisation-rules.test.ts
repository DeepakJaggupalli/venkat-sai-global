import { describe, expect, it } from "vitest";

import { dueReminder } from "./interview-rules";
import { defaultMobilisationChecklist, mobilisationTransitionGate, MOBILISATION_STATUS_LABELS, type MobilisationGateInput } from "./mobilisation-rules";
import { formatInTimeZone, isValidTimeZone, timeZoneOffsetMinutes, utcToZonedLocal, zonedLocalToUtc } from "./timezone";

describe("default mobilisation checklist", () => {
  it("covers passport, medical, visa, emigration clearance, PDOT, contract, ticket and insurance", () => {
    const items = defaultMobilisationChecklist({ emigrationCheckStatus: null });
    expect(items.map((i) => i.key)).toEqual([
      "passport_validity",
      "medical_fitness",
      "employment_visa",
      "emigration_clearance",
      "pre_departure_orientation",
      "employment_contract",
      "travel_ticket",
      "insurance",
    ]);
    expect(new Set(items.map((i) => i.sortOrder)).size).toBe(items.length);
    expect(items.every((i) => i.isCandidateVisible && i.item.length > 0 && i.description.length > 0)).toBe(true);
    expect(items.find((i) => i.key === "pre_departure_orientation")?.item).toContain("PDOT");
  });

  it("requires emigration clearance unless the candidate declared ECNR or a non-Indian passport", () => {
    const required = (status: Parameters<typeof defaultMobilisationChecklist>[0]["emigrationCheckStatus"]) =>
      defaultMobilisationChecklist({ emigrationCheckStatus: status }).find((i) => i.key === "emigration_clearance")!.isRequired;
    expect(required("ecr")).toBe(true);
    expect(required(null)).toBe(true);
    expect(required("ecnr")).toBe(false);
    expect(required("not_applicable")).toBe(false);
  });
});

describe("mobilisation gates", () => {
  const base: MobilisationGateInput = {
    status: "visa_processing",
    emigrationClearanceStatus: "not_assessed",
    visaStatus: "applied",
    medicalStatus: "pending",
    checklist: [
      { item: "Passport", isRequired: true, status: "verified" },
      { item: "Contract", isRequired: true, status: "submitted" },
      { item: "Optional extra", isRequired: false, status: "pending" },
    ],
  };

  it("allows early steps freely", () => {
    expect(mobilisationTransitionGate({ ...base, status: "not_started" }, "documents_pending")).toEqual({ allowed: true });
    expect(mobilisationTransitionGate(base, "emigration_clearance")).toEqual({ allowed: true });
    expect(mobilisationTransitionGate(base, "on_hold")).toEqual({ allowed: true });
  });

  it("blocks booking travel until clearance, visa and medical are in place", () => {
    const blocked = mobilisationTransitionGate(base, "travel_booked");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.missing).toHaveLength(3);
    const ready = { ...base, emigrationClearanceStatus: "granted" as const, visaStatus: "issued" as const, medicalStatus: "fit" as const };
    expect(mobilisationTransitionGate(ready, "travel_booked")).toEqual({ allowed: true });
    expect(mobilisationTransitionGate({ ...ready, emigrationClearanceStatus: "not_required" }, "travel_booked")).toEqual({ allowed: true });
    expect(mobilisationTransitionGate({ ...ready, emigrationClearanceStatus: "applied" }, "travel_booked").allowed).toBe(false);
  });

  it("blocks departure until every required checklist item is verified or not applicable", () => {
    const ready = { ...base, status: "travel_booked" as const, emigrationClearanceStatus: "granted" as const, visaStatus: "issued" as const, medicalStatus: "fit" as const };
    const blocked = mobilisationTransitionGate(ready, "departed");
    expect(blocked).toMatchObject({ allowed: false, missing: ["Contract"] });
    const done = { ...ready, checklist: ready.checklist.map((c) => (c.item === "Contract" ? { ...c, status: "not_applicable" as const } : c)) };
    expect(mobilisationTransitionGate(done, "departed")).toEqual({ allowed: true });
  });

  it("keeps closed records closed and needs arrival before completion", () => {
    expect(mobilisationTransitionGate({ ...base, status: "cancelled" }, "documents_pending").allowed).toBe(false);
    expect(mobilisationTransitionGate({ ...base, status: "completed" }, "arrived").allowed).toBe(false);
    expect(mobilisationTransitionGate(base, "completed").allowed).toBe(false);
  });

  it("has a candidate label for every status", () => {
    expect(Object.values(MOBILISATION_STATUS_LABELS).every((l) => l.length > 0)).toBe(true);
  });
});

describe("interview time zones", () => {
  it("validates IANA zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Asia/Dubai")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("converts wall-clock times to UTC without assuming India time", () => {
    expect(zonedLocalToUtc("2026-12-01T10:30", "Asia/Kolkata").toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(zonedLocalToUtc("2026-12-01T10:30", "Asia/Dubai").toISOString()).toBe("2026-12-01T06:30:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedLocalToUtc("2026-01-15T09:00", "Europe/London").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedLocalToUtc("2026-12-01T00:15", "UTC").toISOString()).toBe("2026-12-01T00:15:00.000Z");
  });

  it("handles daylight-saving gaps and overlaps", () => {
    // 2026-03-29 01:30 does not exist in London (clocks jump 01:00 → 02:00).
    expect(zonedLocalToUtc("2026-03-29T01:30", "Europe/London").toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // 2026-10-25 01:30 happens twice in London: the earlier (BST) instant is used.
    expect(zonedLocalToUtc("2026-10-25T01:30", "Europe/London").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("round-trips and rejects malformed input", () => {
    const instant = zonedLocalToUtc("2026-12-01T10:30", "Asia/Dubai");
    expect(utcToZonedLocal(instant, "Asia/Dubai")).toBe("2026-12-01T10:30");
    expect(timeZoneOffsetMinutes(instant.getTime(), "Asia/Kolkata")).toBe(330);
    expect(formatInTimeZone(instant, "Asia/Dubai", "en-GB")).toContain("10:30");
    expect(() => zonedLocalToUtc("2026-02-30T10:00", "Asia/Dubai")).toThrow();
    expect(() => zonedLocalToUtc("tomorrow", "Asia/Dubai")).toThrow();
    expect(() => zonedLocalToUtc("2026-12-01T10:30", "Nowhere/City")).toThrow();
  });
});

describe("interview reminders", () => {
  const start = new Date("2026-12-01T10:00:00Z");
  it("sends the 24 h reminder inside 24 h and the 2 h reminder inside 2 h", () => {
    expect(dueReminder(start, new Date("2026-11-30T09:59:00Z"))).toBeNull();
    expect(dueReminder(start, new Date("2026-11-30T10:00:00Z"))?.key).toBe("24h");
    expect(dueReminder(start, new Date("2026-12-01T07:59:00Z"))?.key).toBe("24h");
    expect(dueReminder(start, new Date("2026-12-01T08:00:00Z"))?.key).toBe("2h");
    expect(dueReminder(start, new Date("2026-12-01T09:59:00Z"))?.key).toBe("2h");
    expect(dueReminder(start, new Date("2026-12-01T10:00:00Z"))).toBeNull();
  });
});
