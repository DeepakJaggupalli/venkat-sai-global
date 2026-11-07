import { describe, expect, it } from "vitest";

import { computeTicketSla, escalationLevelFor, evaluateSla, STATUTORY_GRIEVANCE_RESOLUTION_HOURS, type SlaSettings } from "./sla";

const HOUR = 3_600_000;
const settings: SlaSettings = {
  firstResponseHours: { urgent: 4, high: 8, normal: 24, low: 72 },
  grievanceAckHours: 24,
  grievanceResolutionDays: 15,
};
const created = new Date("2026-11-01T00:00:00.000Z");

describe("computeTicketSla", () => {
  it("uses the first-response hours of the priority and no resolution deadline for regular tickets", () => {
    for (const [priority, hours] of Object.entries(settings.firstResponseHours) as [keyof SlaSettings["firstResponseHours"], number][]) {
      const sla = computeTicketSla({ createdAt: created, priority, isGrievance: false }, settings);
      expect(sla.firstResponseDueAt.getTime() - created.getTime()).toBe(hours * HOUR);
      expect(sla.resolutionDueAt).toBeNull();
    }
  });

  it("gives grievances the acknowledgement and resolution timelines from settings", () => {
    const sla = computeTicketSla({ createdAt: created, priority: "normal", isGrievance: true, grievanceType: "general" }, settings);
    expect(sla.firstResponseDueAt.getTime() - created.getTime()).toBe(24 * HOUR);
    expect(sla.resolutionDueAt!.getTime() - created.getTime()).toBe(15 * 24 * HOUR);
  });

  it("uses the shorter priority SLA for a grievance acknowledgement", () => {
    const sla = computeTicketSla({ createdAt: created, priority: "urgent", isGrievance: true, grievanceType: "general" }, settings);
    expect(sla.firstResponseDueAt.getTime() - created.getTime()).toBe(4 * HOUR);
  });

  it("applies statutory resolution timelines for content removal and impersonation", () => {
    const removal = computeTicketSla({ createdAt: created, priority: "high", isGrievance: true, grievanceType: "content_removal" }, settings);
    expect(removal.resolutionDueAt!.getTime() - created.getTime()).toBe(STATUTORY_GRIEVANCE_RESOLUTION_HOURS.content_removal! * HOUR);
    const impersonation = computeTicketSla({ createdAt: created, priority: "high", isGrievance: true, grievanceType: "impersonation_or_intimate_content" }, settings);
    expect(impersonation.resolutionDueAt!.getTime() - created.getTime()).toBe(24 * HOUR);
    // The acknowledgement can never be due after the resolution.
    expect(impersonation.firstResponseDueAt.getTime()).toBeLessThanOrEqual(impersonation.resolutionDueAt!.getTime());
  });

  it("falls back to safe defaults when settings are invalid", () => {
    const broken: SlaSettings = { firstResponseHours: { urgent: Number.NaN, high: -1, normal: 0, low: 72 }, grievanceAckHours: Number.NaN, grievanceResolutionDays: 0 };
    const sla = computeTicketSla({ createdAt: created, priority: "normal", isGrievance: true, grievanceType: "general" }, broken);
    expect(sla.firstResponseDueAt.getTime() - created.getTime()).toBe(24 * HOUR);
    expect(sla.resolutionDueAt!.getTime() - created.getTime()).toBe(15 * 24 * HOUR);
  });
});

describe("evaluateSla", () => {
  const base = {
    status: "open" as const,
    firstResponseDueAt: new Date(created.getTime() + 24 * HOUR),
    firstRespondedAt: null,
    resolutionDueAt: new Date(created.getTime() + 15 * 24 * HOUR),
    resolvedAt: null,
  };

  it("reports pending, due soon and breached deadlines", () => {
    expect(evaluateSla(base, new Date(created.getTime() + 1 * HOUR)).firstResponse).toBe("pending");
    expect(evaluateSla(base, new Date(created.getTime() + 23 * HOUR)).firstResponse).toBe("due_soon");
    const late = evaluateSla(base, new Date(created.getTime() + 25 * HOUR));
    expect(late).toMatchObject({ firstResponse: "breached", resolution: "pending", breached: true });
  });

  it("marks deadlines met or missed once the milestone happened", () => {
    const onTime = evaluateSla({ ...base, firstRespondedAt: new Date(created.getTime() + 2 * HOUR) }, new Date(created.getTime() + 30 * HOUR));
    expect(onTime.firstResponse).toBe("met");
    const lateResponse = evaluateSla({ ...base, firstRespondedAt: new Date(created.getTime() + 26 * HOUR) }, new Date(created.getTime() + 30 * HOUR));
    expect(lateResponse.firstResponse).toBe("breached");
  });

  it("ignores open deadlines of resolved tickets and handles tickets without deadlines", () => {
    const resolved = evaluateSla({ ...base, status: "resolved", resolvedAt: new Date(created.getTime() + 3 * HOUR), firstRespondedAt: new Date(created.getTime() + HOUR) }, new Date(created.getTime() + 40 * 24 * HOUR));
    expect(resolved).toMatchObject({ firstResponse: "met", resolution: "met", breached: false });
    expect(evaluateSla({ ...base, firstResponseDueAt: null, resolutionDueAt: null })).toMatchObject({ firstResponse: "none", resolution: "none", breached: false });
  });
});

describe("escalationLevelFor", () => {
  it("escalates to 1 for a missed acknowledgement and 2 for a missed resolution, never lowering", () => {
    expect(escalationLevelFor(0, { firstResponse: false, resolution: false })).toBe(0);
    expect(escalationLevelFor(0, { firstResponse: true, resolution: false })).toBe(1);
    expect(escalationLevelFor(1, { firstResponse: true, resolution: true })).toBe(2);
    expect(escalationLevelFor(3, { firstResponse: true, resolution: false })).toBe(3);
  });
});
