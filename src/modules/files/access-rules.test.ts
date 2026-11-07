import { describe, expect, it } from "vitest";

import { evaluateFileAccess, isGrantActive, shouldLogDataAccess, type AccessFile } from "./access-rules";
import type { ActiveGrant, FileViewer } from "./types";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "44444444-4444-4444-8444-444444444444";

const file = (overrides: Partial<AccessFile> = {}): AccessFile => ({
  id: "55555555-5555-4555-8555-555555555555",
  purpose: "resume",
  visibility: "private",
  ownerUserId: OWNER,
  organizationId: null,
  scanStatus: "clean",
  deletedAt: null,
  ...overrides,
});

const viewer = (overrides: Partial<FileViewer> = {}): FileViewer => ({
  userId: OTHER,
  isStaff: false,
  staffPermissions: new Set(),
  memberships: [],
  ...overrides,
});

const staff = (...permissions: string[]) => viewer({ isStaff: true, staffPermissions: new Set(permissions) });
const member = (organizationId: string, ...permissions: string[]) =>
  viewer({ memberships: [{ organizationId, organizationType: "employer", permissions: new Set(permissions) }] });

const grant = (overrides: Partial<ActiveGrant> = {}): ActiveGrant => ({
  id: "66666666-6666-4666-8666-666666666666",
  granteeUserId: OTHER,
  granteeOrganizationId: null,
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

describe("evaluateFileAccess", () => {
  it("serves public files to anyone, including signed-out visitors", () => {
    expect(evaluateFileAccess(null, file({ visibility: "public", purpose: "org_logo" }))).toMatchObject({ allowed: true, via: "public" });
  });

  it("asks signed-out visitors to sign in for private files", () => {
    expect(evaluateFileAccess(null, file())).toEqual({ allowed: false, reason: "unauthenticated" });
  });

  it("always lets the owner read their file", () => {
    expect(evaluateFileAccess(viewer({ userId: OWNER }), file())).toMatchObject({ allowed: true, via: "owner" });
  });

  it("denies other users without a grant", () => {
    expect(evaluateFileAccess(viewer(), file())).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("treats deleted files as not found, even for the owner", () => {
    expect(evaluateFileAccess(viewer({ userId: OWNER }), file({ deletedAt: new Date() }))).toEqual({ allowed: false, reason: "not_found" });
  });

  it("honours active user and organisation grants, ignoring revoked or expired ones", () => {
    expect(evaluateFileAccess(viewer(), file(), [grant()])).toMatchObject({ allowed: true, via: "grant", organizationId: null });
    expect(evaluateFileAccess(member(ORG), file(), [grant({ granteeUserId: null, granteeOrganizationId: ORG })])).toMatchObject({
      allowed: true,
      via: "grant",
      organizationId: ORG,
    });
    expect(evaluateFileAccess(member(OTHER_ORG), file(), [grant({ granteeUserId: null, granteeOrganizationId: ORG })])).toMatchObject({ allowed: false });
    expect(evaluateFileAccess(viewer(), file(), [grant({ revokedAt: new Date() })])).toMatchObject({ allowed: false });
    expect(evaluateFileAccess(viewer(), file(), [grant({ expiresAt: new Date(Date.now() - 1000) })])).toMatchObject({ allowed: false });
    expect(evaluateFileAccess(viewer(), file(), [grant({ expiresAt: new Date(Date.now() + 60_000) })])).toMatchObject({ allowed: true });
  });

  it("lets members of the owning organisation read org-scoped files (with the required permission)", () => {
    const orgDoc = file({ purpose: "org_document", organizationId: ORG });
    expect(evaluateFileAccess(member(ORG, "employer.company.manage"), orgDoc)).toMatchObject({ allowed: true, via: "organization", organizationId: ORG });
    expect(evaluateFileAccess(member(ORG, "employer.jobs.view"), orgDoc)).toMatchObject({ allowed: false, reason: "forbidden" });
    expect(evaluateFileAccess(member(OTHER_ORG, "employer.company.manage"), orgDoc)).toMatchObject({ allowed: false });
    // org_logo: any active member
    expect(evaluateFileAccess(member(ORG), file({ purpose: "org_logo", organizationId: ORG }))).toMatchObject({ allowed: true, via: "organization" });
  });

  it("does not give employers organisation access to candidate files they did not upload", () => {
    expect(evaluateFileAccess(member(ORG, "employer.candidates.search"), file({ purpose: "resume", organizationId: null }))).toMatchObject({ allowed: false });
  });

  it("requires the purpose's staff permission", () => {
    expect(evaluateFileAccess(staff("candidates.view_documents"), file())).toMatchObject({ allowed: true, via: "staff" });
    expect(evaluateFileAccess(staff("candidates.view"), file())).toMatchObject({ allowed: false, reason: "forbidden" });
    expect(evaluateFileAccess(staff("candidates.view_documents"), file({ purpose: "mobilisation_document" }))).toMatchObject({ allowed: true });
    expect(evaluateFileAccess(staff("orgs.view"), file({ purpose: "partner_licence", organizationId: ORG }))).toMatchObject({ allowed: true });
    expect(evaluateFileAccess(staff("orgs.view"), file({ purpose: "org_document", organizationId: ORG }))).toMatchObject({ allowed: true });
    expect(evaluateFileAccess(staff("commercial.view"), file({ purpose: "invoice", organizationId: ORG }))).toMatchObject({ allowed: true });
    expect(evaluateFileAccess(staff("support.view"), file({ purpose: "ticket_attachment" }))).toMatchObject({ allowed: true });
    expect(evaluateFileAccess(staff("media.manage"), file({ purpose: "cms_media" }))).toMatchObject({ allowed: true });
    expect(evaluateFileAccess(staff("content.view"), file({ purpose: "cms_media" }))).toMatchObject({ allowed: false });
    expect(evaluateFileAccess(staff("candidates.view_documents"), file({ purpose: "invoice" }))).toMatchObject({ allowed: false });
  });

  it("ignores staff permissions held by non-staff accounts", () => {
    expect(evaluateFileAccess(viewer({ isStaff: false, staffPermissions: new Set(["candidates.view_documents"]) }), file())).toMatchObject({ allowed: false });
  });

  it("keeps data exports owner-only (no staff, organisation or grant access)", () => {
    const exportFile = file({ purpose: "data_export", organizationId: ORG });
    expect(evaluateFileAccess(viewer({ userId: OWNER }), exportFile)).toMatchObject({ allowed: true, via: "owner" });
    expect(evaluateFileAccess(staff("privacy.requests", "candidates.view_documents", "audit.view"), exportFile)).toEqual({ allowed: false, reason: "forbidden" });
    expect(evaluateFileAccess(member(ORG), exportFile, [grant()])).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("never serves quarantined files and holds unscanned ones back from everyone but the owner", () => {
    expect(evaluateFileAccess(viewer({ userId: OWNER }), file({ scanStatus: "infected" }))).toEqual({ allowed: false, reason: "quarantined" });
    expect(evaluateFileAccess(null, file({ visibility: "public", scanStatus: "infected" }))).toEqual({ allowed: false, reason: "quarantined" });
    expect(evaluateFileAccess(staff("candidates.view_documents"), file({ scanStatus: "pending" }))).toEqual({ allowed: false, reason: "processing" });
    expect(evaluateFileAccess(null, file({ visibility: "public", scanStatus: "error" }))).toEqual({ allowed: false, reason: "processing" });
    expect(evaluateFileAccess(viewer({ userId: OWNER }), file({ scanStatus: "pending" }))).toMatchObject({ allowed: true, via: "owner" });
    expect(evaluateFileAccess(staff("candidates.view_documents"), file({ scanStatus: "not_scanned" }))).toMatchObject({ allowed: true });
  });

  it("does not reveal processing state to people who could not read the file anyway", () => {
    expect(evaluateFileAccess(viewer(), file({ scanStatus: "pending" }))).toEqual({ allowed: false, reason: "forbidden" });
  });
});

describe("grant activity and data-access logging", () => {
  it("evaluates grant expiry against the given time", () => {
    const now = new Date("2026-11-07T00:00:00Z");
    expect(isGrantActive({ expiresAt: new Date("2026-11-08T00:00:00Z"), revokedAt: null }, now)).toBe(true);
    expect(isGrantActive({ expiresAt: new Date("2026-11-06T00:00:00Z"), revokedAt: null }, now)).toBe(false);
    expect(isGrantActive({ expiresAt: null, revokedAt: new Date() }, now)).toBe(false);
  });

  it("logs sensitive reads by anyone other than the owner", () => {
    expect(shouldLogDataAccess({ purpose: "resume" }, { allowed: true, via: "staff", organizationId: null })).toBe(true);
    expect(shouldLogDataAccess({ purpose: "resume" }, { allowed: true, via: "grant", organizationId: ORG })).toBe(true);
    expect(shouldLogDataAccess({ purpose: "resume" }, { allowed: true, via: "owner", organizationId: null })).toBe(false);
    expect(shouldLogDataAccess({ purpose: "org_logo" }, { allowed: true, via: "organization", organizationId: ORG })).toBe(false);
    expect(shouldLogDataAccess({ purpose: "resume" }, { allowed: false, reason: "forbidden" })).toBe(false);
  });
});
