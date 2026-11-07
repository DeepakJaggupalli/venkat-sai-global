import { describe, expect, it } from "vitest";

import { threadAccess, type ThreadFacts, type ThreadViewer } from "./thread-access";

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const ME = "00000000-0000-4000-8000-000000000001";

const employerThread: ThreadFacts = { organizationId: ORG_A, contextType: "requirement", status: "open" };
const candidateThread: ThreadFacts = { organizationId: null, contextType: "application", status: "open" };

const staff = (permissions: string[]): ThreadViewer => ({ kind: "staff", userId: ME, permissions: new Set(permissions) });
const member = (organizationId: string, organizationType: "employer" | "recruitment_partner" | "institution", permissions: string[] = []): ThreadViewer => ({
  kind: "member",
  userId: ME,
  memberships: [{ organizationId, organizationType, permissions: new Set(permissions) }],
});
const candidate: ThreadViewer = { kind: "user", userId: ME };

describe("threadAccess — staff", () => {
  it("allows participants and staff with the context permission", () => {
    expect(threadAccess(staff([]), employerThread, { userId: ME, organizationId: null, removedAt: null })).toEqual({ canRead: true, canPost: true, via: "participant" });
    expect(threadAccess(staff(["requirements.view"]), employerThread, null)).toEqual({ canRead: true, canPost: true, via: "staff" });
  });
  it("refuses staff without participation or the right permission", () => {
    expect(threadAccess(staff(["partners.view"]), employerThread, null).canRead).toBe(false);
    expect(threadAccess(staff([]), employerThread, { userId: ME, organizationId: null, removedAt: new Date() }).canRead).toBe(false);
  });
});

describe("threadAccess — organisation members", () => {
  it("lets active members of the thread's organisation read and post", () => {
    expect(threadAccess(member(ORG_A, "employer"), employerThread, null)).toEqual({ canRead: true, canPost: true, via: "organization" });
  });
  it("never shows another organisation's threads, even with a stale participant row", () => {
    expect(threadAccess(member(ORG_B, "employer"), employerThread, null).canRead).toBe(false);
    expect(threadAccess(member(ORG_B, "employer"), employerThread, { userId: ME, organizationId: ORG_A, removedAt: null }).canRead).toBe(false);
  });
  it("requires partner.messages for recruitment partners", () => {
    const partnerThread: ThreadFacts = { organizationId: ORG_A, contextType: "partner_assignment", status: "open" };
    expect(threadAccess(member(ORG_A, "recruitment_partner"), partnerThread, null).canRead).toBe(false);
    expect(threadAccess(member(ORG_A, "recruitment_partner", ["partner.messages"]), partnerThread, null).canRead).toBe(true);
  });
  it("allows a member who was added individually to a thread without an organisation", () => {
    expect(threadAccess(member(ORG_B, "employer"), candidateThread, { userId: ME, organizationId: null, removedAt: null }).canRead).toBe(true);
  });
});

describe("threadAccess — candidates and other users", () => {
  it("allows active participants only", () => {
    expect(threadAccess(candidate, candidateThread, { userId: ME, organizationId: null, removedAt: null })).toEqual({ canRead: true, canPost: true, via: "participant" });
    expect(threadAccess(candidate, candidateThread, null).canRead).toBe(false);
    expect(threadAccess(candidate, candidateThread, { userId: ME, organizationId: null, removedAt: new Date() }).canRead).toBe(false);
  });
  it("ignores participant rows belonging to someone else", () => {
    expect(threadAccess(candidate, candidateThread, { userId: "00000000-0000-4000-8000-000000000002", organizationId: null, removedAt: null }).canRead).toBe(false);
  });
  it("cannot read organisation threads through an organisation participant row", () => {
    expect(threadAccess(candidate, employerThread, { userId: ME, organizationId: ORG_A, removedAt: null }).canRead).toBe(false);
  });
});

describe("closed threads", () => {
  it("are read-only for everyone", () => {
    const closed: ThreadFacts = { ...employerThread, status: "closed" };
    expect(threadAccess(staff(["requirements.view"]), closed, null)).toEqual({ canRead: true, canPost: false, via: "staff" });
    expect(threadAccess(member(ORG_A, "employer"), closed, null)).toEqual({ canRead: true, canPost: false, via: "organization" });
  });
});
