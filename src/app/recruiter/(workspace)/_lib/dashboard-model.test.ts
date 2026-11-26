import { describe, expect, it } from "vitest";

import { PARTNER_PERMISSIONS, DEFAULT_ROLES } from "@/config/permissions";

import {
  balanceColumns,
  canTakeSubmissions,
  daysFromToday,
  expiringLicences,
  hiringFunnel,
  needsSetup,
  partnerActionDefs,
  partnerQuickActions,
  partnerSetupChecklist,
  submissionStages,
  submitCandidateHref,
  summarizeSettlements,
  weeklySeries,
  weeklyWindowStart,
  weekStartOf,
  type PartnerSetupInput,
} from "./dashboard-model";

const ALL = PARTNER_PERMISSIONS.map((p) => p.key);
const roleOf = (key: string): string[] => {
  const role = DEFAULT_ROLES.find((r) => r.scope === "recruitment_partner" && r.key === key);
  if (!role) throw new Error(`no partner role ${key}`);
  return [...role.permissions];
};
const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("partner quick actions", () => {
  it("gives the owner every main button of the portal", () => {
    const { work, agency } = partnerQuickActions(new Set(ALL));
    expect(labels(work)).toEqual(["Submit a candidate", "My candidates", "Requirements", "Submissions", "Interviews", "Documents", "Messages", "Support"]);
    expect(labels(agency)).toEqual(["Settlements", "Performance", "Team", "Agency profile", "Billing", "Announcements"]);
  });

  it("only shows a recruiter the work their role allows", () => {
    const { work, agency } = partnerQuickActions(roleOf("recruiter"));
    expect(labels(work)).toEqual(["Submit a candidate", "My candidates", "Requirements", "Submissions", "Interviews", "Documents", "Messages", "Support"]);
    expect(agency).toEqual([]);
  });

  it("gives a viewer read-only buttons and never submit, documents, money or team", () => {
    const { work, agency } = partnerQuickActions(roleOf("viewer"));
    expect(labels(work)).toEqual(["Requirements", "Submissions", "Interviews", "Support"]);
    expect(labels(agency)).toEqual(["Performance"]);
  });

  it("always keeps Support, even with no permissions", () => {
    expect(labels(partnerQuickActions([]).work)).toEqual(["Support"]);
  });

  it("every button that needs a permission names a real partner permission", () => {
    const known = new Set(ALL);
    for (const def of partnerActionDefs()) if (def.permission) expect(known.has(def.permission), def.label).toBe(true);
  });

  it("does not leak the permission or group into the rendered items", () => {
    for (const item of partnerQuickActions(new Set(ALL)).work) {
      expect(item).not.toHaveProperty("permission");
      expect(item).not.toHaveProperty("group");
    }
  });

  it("passes real counts through as badges", () => {
    const { work, agency } = partnerQuickActions(new Set(ALL), { openRequirements: 2, unreadMessages: 3, settlementsAwaiting: 1, pendingInvites: 0 });
    expect(work.find((i) => i.label === "Requirements")?.badge).toBe(2);
    expect(work.find((i) => i.label === "Messages")?.badge).toBe(3);
    expect(agency.find((i) => i.label === "Settlements")?.badge).toBe(1);
    expect(agency.find((i) => i.label === "Team")?.badge).toBe(0);
    expect(work.find((i) => i.label === "Support")?.badge).toBeUndefined();
  });

  it("points Submit a candidate at the given target", () => {
    const { work } = partnerQuickActions(new Set(ALL), {}, "/recruiter/requirements/abc/submit");
    expect(work[0]).toMatchObject({ label: "Submit a candidate", href: "/recruiter/requirements/abc/submit" });
  });
});

describe("submit a candidate target", () => {
  const open = { id: "a1", status: "active", submissionLimit: null, submissionsUsed: 3 };
  it("goes straight to the form when exactly one requirement is open with room", () => {
    expect(submitCandidateHref([open], 1)).toBe("/recruiter/requirements/a1/submit");
  });
  it("goes to the list to pick one otherwise", () => {
    expect(submitCandidateHref([open, { ...open, id: "a2" }], 2)).toBe("/recruiter/requirements");
    expect(submitCandidateHref([], 0)).toBe("/recruiter/requirements");
    expect(submitCandidateHref(null, null)).toBe("/recruiter/requirements");
    expect(submitCandidateHref([{ ...open, submissionLimit: 3 }], 1)).toBe("/recruiter/requirements");
  });
  it("knows when an assignment can take submissions", () => {
    expect(canTakeSubmissions(open)).toBe(true);
    expect(canTakeSubmissions({ ...open, status: "paused" })).toBe(false);
    expect(canTakeSubmissions({ ...open, submissionLimit: 4 })).toBe(true);
    expect(canTakeSubmissions({ ...open, submissionLimit: 3 })).toBe(false);
  });
});

describe("agency set-up checklist", () => {
  const fresh: PartnerSetupInput = {
    orgStatus: "draft",
    readinessIssueCodes: ["city", "business_type", "licence", "document_registration"],
    agreementStatuses: [],
    memberCount: 1,
    pendingInvites: 0,
    submissionsMade: 0,
    canManageTeam: true,
    canSubmit: true,
  };
  const done = (input: PartnerSetupInput) => Object.fromEntries(partnerSetupChecklist(input).map((i) => [i.id, i.done]));

  it("starts with nothing done for a new agency", () => {
    expect(done(fresh)).toEqual({ profile: false, licence: false, documents: false, verification: false, agreement: false, team: false, "first-submission": false });
  });

  it("marks each step from real records", () => {
    expect(done({ ...fresh, readinessIssueCodes: ["licence"], pendingInvites: 1 })).toMatchObject({ profile: true, licence: false, documents: true, team: true });
    expect(done({ ...fresh, orgStatus: "under_review" })).toMatchObject({ profile: true, licence: true, documents: true, verification: true, agreement: false });
    expect(done({ ...fresh, orgStatus: "verified", agreementStatuses: ["superseded", "active"], memberCount: 3, submissionsMade: 2 })).toEqual({
      profile: true,
      licence: true,
      documents: true,
      verification: true,
      agreement: true,
      team: true,
      "first-submission": true,
    });
  });

  it("tells the partner whether the agreement is waiting for them", () => {
    const agreement = (input: PartnerSetupInput) => partnerSetupChecklist(input).find((i) => i.id === "agreement")?.description;
    expect(agreement({ ...fresh, orgStatus: "verified", agreementStatuses: ["pending"] })).toMatch(/accept it/);
    expect(agreement({ ...fresh, orgStatus: "verified" })).toMatch(/Nothing to do/);
    expect(agreement(fresh)).toMatch(/once you are verified/);
  });

  it("leaves out the steps the member cannot do", () => {
    const ids = partnerSetupChecklist({ ...fresh, canManageTeam: false, canSubmit: false }).map((i) => i.id);
    expect(ids).toEqual(["profile", "licence", "documents", "verification", "agreement"]);
  });

  it("hides once every required step is done, even if the optional team step is open", () => {
    const allDone = { ...fresh, orgStatus: "verified", agreementStatuses: ["active"], submissionsMade: 1 };
    expect(needsSetup(partnerSetupChecklist(allDone))).toBe(false);
    expect(needsSetup(partnerSetupChecklist({ ...allDone, submissionsMade: 0 }))).toBe(true);
    expect(needsSetup(partnerSetupChecklist(fresh))).toBe(true);
  });

  it("links every step inside the Partner Portal", () => {
    for (const item of partnerSetupChecklist(fresh)) expect(item.href.startsWith("/recruiter/")).toBe(true);
  });
});

describe("weekly submissions series", () => {
  it("finds the Monday of a week", () => {
    expect(weekStartOf("2026-11-26")).toBe("2026-11-23"); // Thursday
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23"); // Monday
    expect(weekStartOf("2026-11-29")).toBe("2026-11-23"); // Sunday
    expect(weeklyWindowStart("2026-11-26", 8)).toBe("2026-10-05");
  });

  it("fills 8 weeks oldest first, zero for empty weeks, ignoring rows outside the window", () => {
    const series = weeklySeries(
      [
        { weekStart: "2026-11-23", count: 2 },
        { weekStart: "2026-11-02", count: 8 },
        { weekStart: "2026-09-28", count: 50 },
      ],
      "2026-11-26",
      8,
    );
    expect(series).toHaveLength(8);
    expect(series[0]).toEqual({ label: "5 Oct", value: 0 });
    expect(series.at(-1)).toEqual({ label: "23 Nov", value: 2 });
    expect(series.find((p) => p.label === "2 Nov")?.value).toBe(8);
    expect(series.reduce((n, p) => n + p.value, 0)).toBe(10);
  });
});

describe("stages and funnel", () => {
  it("lists every stage in order with zeros", () => {
    expect(submissionStages({ accepted: 2, submitted: 5 })).toEqual([
      { status: "submitted", count: 5 },
      { status: "under_review", count: 0 },
      { status: "duplicate", count: 0 },
      { status: "accepted", count: 2 },
      { status: "rejected", count: 0 },
      { status: "withdrawn", count: 0 },
    ]);
  });
  it("turns performance into a funnel", () => {
    expect(hiringFunnel({ profilesSubmitted: 8, accepted: 4, shortlisted: 3, interviewed: 2, placed: 1, joined: 1 }).map((p) => p.value)).toEqual([8, 4, 3, 2, 1, 1]);
  });
});

describe("settlement summary", () => {
  it("totals net amounts per currency and never assumes one", () => {
    const summary = summarizeSettlements(
      [
        { status: "approved", currency: "AED", count: 1, netMinor: 150_000 },
        { status: "pending_approval", currency: "AED", count: 2, netMinor: 50_000 },
        { status: "pending_approval", currency: "INR", count: 1, netMinor: 1_000_000 },
        { status: "paid", currency: "USD", count: 3, netMinor: 30_000 },
        { status: "disputed", currency: "INR", count: 1, netMinor: 5_000 },
      ],
      "en-IN",
    );
    expect(summary.awaitingCount).toBe(4);
    expect(summary.awaitingAmounts).toHaveLength(2);
    expect(summary.awaitingAmounts[0]).toMatch(/AED/);
    expect(summary.awaitingAmounts[0]).toMatch(/2,000/);
    expect(summary.awaitingAmounts[1]).toMatch(/₹/);
    expect(summary.paidCount).toBe(3);
    expect(summary.paidAmounts[0]).toMatch(/\$|US/);
    expect(summary.disputedCount).toBe(1);
  });
  it("is empty with no settlements", () => {
    expect(summarizeSettlements([])).toEqual({ awaitingCount: 0, awaitingAmounts: [], paidCount: 0, paidAmounts: [], disputedCount: 0 });
  });
});

describe("licence alerts", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  it("counts days to a date", () => {
    expect(daysFromToday("2026-11-26", now)).toBe(0);
    expect(daysFromToday("2026-12-06", now)).toBe(10);
    expect(daysFromToday("2026-11-20", now)).toBe(-6);
    expect(daysFromToday(null, now)).toBeNull();
    expect(daysFromToday("not a date", now)).toBeNull();
  });
  it("lists verified licences expiring within 60 days, soonest first", () => {
    const list = expiringLicences(
      [
        { id: "a", licenceNumber: "A", verificationStatus: "verified", validUntil: "2027-06-01" },
        { id: "b", licenceNumber: "B", verificationStatus: "verified", validUntil: "2026-12-20" },
        { id: "c", licenceNumber: "C", verificationStatus: "verified", validUntil: "2026-11-01" },
        { id: "d", licenceNumber: "D", verificationStatus: "pending", validUntil: "2026-12-01" },
        { id: "e", licenceNumber: "E", verificationStatus: "verified", validUntil: null },
      ],
      now,
    );
    expect(list.map((l) => [l.id, l.daysLeft])).toEqual([
      ["c", -25],
      ["b", 24],
    ]);
  });
});

describe("two-column layout", () => {
  it("puts each card in the shorter column, in order", () => {
    const [left, right] = balanceColumns([
      { key: "requirements", rows: 1 },
      { key: "submissions", rows: 5 },
      { key: "interviews", rows: 4 },
      { key: "documents", rows: 4 },
      { key: "settlements", rows: 1 },
      { key: "agency", rows: 4 },
    ]);
    expect(left.map((c) => c.key)).toEqual(["requirements", "interviews", "settlements", "agency"]);
    expect(right.map((c) => c.key)).toEqual(["submissions", "documents"]);
  });
  it("handles none or one card", () => {
    expect(balanceColumns([])).toEqual([[], []]);
    expect(balanceColumns([{ rows: 3 }])).toEqual([[{ rows: 3 }], []]);
  });
});
