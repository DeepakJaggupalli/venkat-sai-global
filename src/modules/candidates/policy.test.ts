import { describe, expect, it } from "vitest";

import { DEFAULT_PRIVACY_FLAGS, isDiscoverableByEmployer, maskedName, resolveCandidateAccess, type CandidateState, type ViewerFacts } from "./policy";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

const state = (overrides: Partial<CandidateState> = {}): CandidateState => ({
  visibility: "public_to_employers",
  isOpenToWork: true,
  deleted: false,
  accountActive: true,
  privacy: { ...DEFAULT_PRIVACY_FLAGS },
  ...overrides,
});

const staff = (...permissions: string[]): ViewerFacts => ({ kind: "staff", permissions: new Set(permissions) });

const employer = (overrides: Partial<Extract<ViewerFacts, { kind: "employer" }>> = {}): ViewerFacts => ({
  kind: "employer",
  organizationId: ORG,
  organizationStatus: "verified",
  permissions: new Set(["employer.candidates.search", "employer.pipeline.view"]),
  hasApplicationShare: false,
  activeUnlock: null,
  ...overrides,
});

const partner = (overrides: Partial<Extract<ViewerFacts, { kind: "partner" }>> = {}): ViewerFacts => ({
  kind: "partner",
  organizationId: ORG,
  organizationStatus: "verified",
  permissions: new Set(["partner.candidates.submit"]),
  isSourcingPartner: true,
  ...overrides,
});

describe("self", () => {
  it("sees everything without reveal steps", () => {
    const access = resolveCandidateAccess(state({ visibility: "hidden" }), { kind: "self" });
    expect(access).toMatchObject({ canView: true, contact: "full", documents: "all", identity: true, gender: true, references: true, portfolio: "all", internal: false });
  });
});

describe("staff", () => {
  it("needs candidates.view", () => {
    expect(resolveCandidateAccess(state(), staff()).denial).toBe("permission_required");
  });

  it("gets masked contact, no documents or identity without the sensitive permissions", () => {
    const access = resolveCandidateAccess(state(), staff("candidates.view"));
    expect(access).toMatchObject({ canView: true, contact: "none", contactHiddenReason: "permission_required", documents: "none", resume: false, identity: false, references: false, internal: true });
  });

  it("reveals contact (logged) with candidates.view_contact and documents with candidates.view_documents", () => {
    const access = resolveCandidateAccess(state(), staff("candidates.view", "candidates.view_contact", "candidates.view_documents"));
    expect(access).toMatchObject({ contact: "on_reveal", references: true, documents: "all", resume: true, identity: true, gender: false });
  });

  it("sees gender only with candidates.manage and deleted profiles only for record management", () => {
    expect(resolveCandidateAccess(state(), staff("candidates.view", "candidates.manage")).gender).toBe(true);
    expect(resolveCandidateAccess(state({ deleted: true }), staff("candidates.view")).denial).toBe("deleted");
    expect(resolveCandidateAccess(state({ deleted: true }), staff("candidates.view", "candidates.manage")).canView).toBe(true);
  });

  it("does not discover hidden profiles", () => {
    expect(resolveCandidateAccess(state({ visibility: "hidden" }), staff("candidates.view")).discoverable).toBe(false);
    expect(resolveCandidateAccess(state({ visibility: "venkat_sai_only" }), staff("candidates.view")).discoverable).toBe(true);
  });
});

describe("employer", () => {
  it("discovers public profiles of open-to-work candidates, with masked name and no contact", () => {
    const access = resolveCandidateAccess(state(), employer());
    expect(access).toMatchObject({ canView: true, discoverable: true, fullName: false, contact: "none", contactHiddenReason: "unlock_or_application_required", documents: "none", resume: false });
    expect(access.identity || access.references || access.gender || access.internal).toBe(false);
  });

  it("applies visibility: verified_employers needs a verified organisation; venkat_sai_only and hidden are never discoverable", () => {
    expect(isDiscoverableByEmployer({ visibility: "verified_employers", isOpenToWork: true }, "verified")).toBe(true);
    expect(isDiscoverableByEmployer({ visibility: "verified_employers", isOpenToWork: true }, "pending")).toBe(false);
    expect(resolveCandidateAccess(state({ visibility: "verified_employers" }), employer({ organizationStatus: "pending" })).denial).toBe("not_discoverable");
    expect(resolveCandidateAccess(state({ visibility: "venkat_sai_only" }), employer()).denial).toBe("not_discoverable");
    expect(resolveCandidateAccess(state({ visibility: "hidden" }), employer()).denial).toBe("not_discoverable");
    expect(resolveCandidateAccess(state({ isOpenToWork: false }), employer()).denial).toBe("not_discoverable");
  });

  it("is blocked completely by the candidate's block list, even with an application", () => {
    const blocked = state({ privacy: { ...DEFAULT_PRIVACY_FLAGS, blockedOrganizationIds: [ORG] } });
    expect(resolveCandidateAccess(blocked, employer({ hasApplicationShare: true })).denial).toBe("blocked");
    expect(resolveCandidateAccess(blocked, employer({ organizationId: OTHER_ORG })).canView).toBe(true);
  });

  it("an application shared with consent opens the profile regardless of visibility, with contact on reveal and shareable documents", () => {
    const access = resolveCandidateAccess(state({ visibility: "hidden" }), employer({ hasApplicationShare: true }));
    expect(access).toMatchObject({ canView: true, discoverable: false, fullName: true, contact: "on_reveal", documents: "shareable", resume: true, directContact: true });
    expect(access.relationship).toEqual({ applied: true, unlocked: false, sourced: false });
  });

  it("an active unlock gives contact and shareable documents", () => {
    const access = resolveCandidateAccess(state(), employer({ activeUnlock: { expiresAt: null } }));
    expect(access).toMatchObject({ contact: "on_reveal", documents: "shareable", fullName: true });
  });

  it("honours 'contact only after unlock' switched off, and photo / current employer settings", () => {
    const open = state({ privacy: { ...DEFAULT_PRIVACY_FLAGS, showContactToUnlockedOnly: false, showPhoto: true, showCurrentEmployer: true, showFullNameToEmployers: true } });
    expect(resolveCandidateAccess(open, employer())).toMatchObject({ contact: "on_reveal", photo: true, currentEmployer: true, fullName: true, documents: "none" });
  });

  it("needs employer.candidates.search to discover; pipeline.view is enough with a relationship", () => {
    const pipelineOnly = new Set(["employer.pipeline.view"]);
    expect(resolveCandidateAccess(state(), employer({ permissions: pipelineOnly })).denial).toBe("permission_required");
    expect(resolveCandidateAccess(state(), employer({ permissions: pipelineOnly, hasApplicationShare: true })).canView).toBe(true);
  });

  it("never sees a minor without granted guardian consent (DPDP), even with a relationship", () => {
    expect(resolveCandidateAccess(state({ restrictedMinor: true }), employer({ hasApplicationShare: true })).denial).toBe("minor_restricted");
    expect(resolveCandidateAccess(state({ restrictedMinor: true }), partner()).denial).toBe("minor_restricted");
    expect(resolveCandidateAccess(state({ restrictedMinor: true }), staff("candidates.view")).canView).toBe(true);
  });

  it("loses access when suspended / rejected, or when the candidate account is closed", () => {
    expect(resolveCandidateAccess(state(), employer({ organizationStatus: "suspended", hasApplicationShare: true })).denial).toBe("organization_inactive");
    expect(resolveCandidateAccess(state(), employer({ organizationStatus: "rejected" })).denial).toBe("organization_inactive");
    expect(resolveCandidateAccess(state({ accountActive: false }), employer({ hasApplicationShare: true })).denial).toBe("deleted");
  });
});

describe("partner", () => {
  it("sees only candidates it sourced, documents limited to its own uploads", () => {
    expect(resolveCandidateAccess(state({ visibility: "hidden" }), partner())).toMatchObject({ canView: true, contact: "on_reveal", documents: "viewer_uploads", resume: true, identity: false });
    expect(resolveCandidateAccess(state(), partner({ isSourcingPartner: false })).denial).toBe("not_sourced");
  });

  it("respects blocking and needs a partner permission", () => {
    expect(resolveCandidateAccess(state({ privacy: { ...DEFAULT_PRIVACY_FLAGS, blockedOrganizationIds: [ORG] } }), partner()).denial).toBe("blocked");
    expect(resolveCandidateAccess(state(), partner({ permissions: new Set(["partner.dashboard"]) })).denial).toBe("permission_required");
  });
});

describe("maskedName", () => {
  it("shows initials only", () => {
    expect(maskedName("Ravi Kumar Reddy")).toBe("R. R.");
    expect(maskedName("Lakshmi")).toBe("L.");
    expect(maskedName("  ")).toBe("Candidate");
  });
});
