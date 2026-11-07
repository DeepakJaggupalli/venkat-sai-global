import { describe, expect, it } from "vitest";

import {
  canGrantRole,
  computeVerificationExpiry,
  documentLapsesAt,
  dueReminderThreshold,
  evaluateInvitationAcceptance,
  evaluatePartnerLicenceRequirement,
  evaluateVerificationReadiness,
  INVITATION_TTL_DAYS,
  invitationStatus,
  invitationTtlDays,
  performsRegulatedRecruitment,
  statusAfterReactivation,
  statusAfterVerificationDecision,
  unknownPermissions,
  verificationSubmissionCheck,
  type ReadinessLicence,
  type VerificationReadinessInput,
} from "./rules";

const NOW = new Date("2026-11-07T10:00:00.000Z");
const DAY = 86_400_000;

const baseOrg = { name: "Acme Fabrication LLC", countryCode: "AE", city: "Dubai", email: "hr@acme.example", phone: null };

function readiness(overrides: Partial<VerificationReadinessInput>) {
  return evaluateVerificationReadiness({ type: "employer", organization: baseOrg, documents: [], now: NOW, ...overrides });
}

function licence(overrides: Partial<ReadinessLicence> = {}): ReadinessLicence {
  return {
    id: "lic-1",
    licenceType: "india_recruiting_agent",
    issuingCountryCode: "IN",
    verificationStatus: "verified",
    validFrom: "2025-01-01",
    validUntil: "2028-01-01",
    deletedAt: null,
    ...overrides,
  };
}

describe("verification readiness", () => {
  it("requires a current registration certificate for employers", () => {
    const missing = readiness({});
    expect(missing.ready).toBe(false);
    expect(missing.issues.map((i) => i.code)).toContain("document_registration");

    const ok = readiness({ documents: [{ documentType: "registration_certificate", reviewStatus: "pending", expiresAt: null }] });
    expect(ok.ready).toBe(true);
    expect(ok.documentRequirements).toEqual([{ id: "registration", label: expect.any(String), met: true }]);
  });

  it("ignores rejected and expired documents but keeps one valid through its printed expiry day", () => {
    expect(readiness({ documents: [{ documentType: "registration_certificate", reviewStatus: "rejected", expiresAt: null }] }).ready).toBe(false);
    expect(readiness({ documents: [{ documentType: "registration_certificate", reviewStatus: "accepted", expiresAt: new Date("2026-11-06T00:00:00Z") }] }).ready).toBe(false);
    // Printed expiry today: still valid until midnight UTC.
    expect(readiness({ documents: [{ documentType: "registration_certificate", reviewStatus: "accepted", expiresAt: new Date("2026-11-07T00:00:00Z") }] }).ready).toBe(true);
  });

  it("checks profile basics", () => {
    const r = readiness({ organization: { ...baseOrg, city: null, email: null, phone: null }, documents: [{ documentType: "registration_certificate", reviewStatus: "pending", expiresAt: null }] });
    expect(r.issues.map((i) => i.code)).toEqual(["city", "contact"]);
  });

  it("requires registration plus accreditation or affiliation for institutions", () => {
    const docs = [{ documentType: "registration_certificate" as const, reviewStatus: "pending" as const, expiresAt: null }];
    const r = readiness({ type: "institution", institution: { institutionKind: "iti" }, documents: docs });
    expect(r.issues.map((i) => i.code)).toEqual(["document_recognition"]);
    const ok = readiness({ type: "institution", institution: { institutionKind: "iti" }, documents: [...docs, { documentType: "affiliation", reviewStatus: "pending", expiresAt: null }] });
    expect(ok.ready).toBe(true);
    expect(readiness({ type: "institution", institution: { institutionKind: null }, documents: [...docs, { documentType: "accreditation", reviewStatus: "pending", expiresAt: null }] }).issues.map((i) => i.code)).toEqual([
      "institution_kind",
    ]);
  });

  it("applies the licence rule to partners that recruit for overseas employment", () => {
    const docs = [{ documentType: "registration_certificate" as const, reviewStatus: "pending" as const, expiresAt: null }];
    const partner = { businessType: "agency", servicesProvided: ["candidate_sourcing", "emigration_clearance"], territories: [], licences: [] as ReadinessLicence[] };
    const missing = readiness({ type: "recruitment_partner", organization: { ...baseOrg, countryCode: "IN" }, documents: docs, partner });
    expect(missing.ready).toBe(false);
    expect(missing.licence).toMatchObject({ required: true, satisfied: false, requiredLicenceType: "india_recruiting_agent" });
    const pendingOk = readiness({
      type: "recruitment_partner",
      organization: { ...baseOrg, countryCode: "IN" },
      documents: docs,
      partner: { ...partner, licences: [licence({ verificationStatus: "pending" })] },
    });
    expect(pendingOk.ready).toBe(true);
  });
});

describe("recruitment licence rule", () => {
  const today = "2026-11-07";

  it("only regulates recruiting for employment abroad", () => {
    expect(performsRegulatedRecruitment({ homeCountryCode: "IN", businessType: "travel_partner", servicesProvided: ["visa_processing"], territories: [] })).toBe(false);
    expect(performsRegulatedRecruitment({ homeCountryCode: "IN", businessType: "sourcing_partner", servicesProvided: ["candidate_sourcing"], territories: [] })).toBe(false);
    expect(
      performsRegulatedRecruitment({ homeCountryCode: "IN", businessType: "sourcing_partner", servicesProvided: ["candidate_sourcing"], territories: [{ countryCode: "IN", scope: "both" }] }),
    ).toBe(false);
    expect(
      performsRegulatedRecruitment({ homeCountryCode: "IN", businessType: "sourcing_partner", servicesProvided: ["candidate_sourcing"], territories: [{ countryCode: "SA", scope: "placement" }] }),
    ).toBe(true);
    expect(performsRegulatedRecruitment({ homeCountryCode: "NP", businessType: "agency", servicesProvided: ["pre_departure_orientation"], territories: [] })).toBe(true);
  });

  it("needs an Indian Recruiting Agent registration when based in or sourcing from India", () => {
    const input = { homeCountryCode: "IN", businessType: "agency", servicesProvided: ["emigration_clearance"], territories: [], today, stage: "approval" as const };
    expect(evaluatePartnerLicenceRequirement({ ...input, licences: [licence({ licenceType: "foreign_recruitment_licence", issuingCountryCode: "AE" })] }).satisfied).toBe(false);
    expect(evaluatePartnerLicenceRequirement({ ...input, licences: [licence()] })).toMatchObject({ required: true, satisfied: true, qualifyingLicenceIds: ["lic-1"] });
    // A Nepal agency sourcing from India also needs the Indian registration.
    expect(
      evaluatePartnerLicenceRequirement({
        ...input,
        homeCountryCode: "NP",
        territories: [{ countryCode: "IN", scope: "sourcing" }],
        licences: [licence({ licenceType: "foreign_recruitment_licence", issuingCountryCode: "NP" })],
      }).satisfied,
    ).toBe(false);
    expect(
      evaluatePartnerLicenceRequirement({ ...input, homeCountryCode: "NP", licences: [licence({ licenceType: "foreign_recruitment_licence", issuingCountryCode: "NP" })] }).satisfied,
    ).toBe(true);
  });

  it("accepts pending licences at submission only, and never lapsed, future, rejected or deleted ones", () => {
    const input = { homeCountryCode: "IN", businessType: "agency", servicesProvided: ["emigration_clearance"], territories: [], today };
    expect(evaluatePartnerLicenceRequirement({ ...input, stage: "submission", licences: [licence({ verificationStatus: "pending" })] }).satisfied).toBe(true);
    expect(evaluatePartnerLicenceRequirement({ ...input, stage: "approval", licences: [licence({ verificationStatus: "pending" })] }).satisfied).toBe(false);
    for (const l of [
      licence({ validUntil: "2026-11-06" }),
      licence({ validFrom: "2026-12-01" }),
      licence({ verificationStatus: "rejected" }),
      licence({ verificationStatus: "expired" }),
      licence({ deletedAt: new Date() }),
    ]) {
      expect(evaluatePartnerLicenceRequirement({ ...input, stage: "submission", licences: [l] }).satisfied).toBe(false);
    }
    // Valid through the last day.
    expect(evaluatePartnerLicenceRequirement({ ...input, stage: "approval", licences: [licence({ validUntil: today })] }).satisfied).toBe(true);
  });
});

describe("status transitions", () => {
  it("controls who may submit", () => {
    expect(verificationSubmissionCheck("draft")).toEqual({ allowed: true, renewal: false });
    expect(verificationSubmissionCheck("rejected")).toEqual({ allowed: true, renewal: false });
    expect(verificationSubmissionCheck("expired")).toEqual({ allowed: true, renewal: false });
    expect(verificationSubmissionCheck("verified")).toEqual({ allowed: true, renewal: true });
    expect(verificationSubmissionCheck("pending").allowed).toBe(false);
    expect(verificationSubmissionCheck("under_review").allowed).toBe(false);
    expect(verificationSubmissionCheck("suspended").allowed).toBe(false);
  });

  it("maps decisions to organisation statuses (renewals keep a valid verification)", () => {
    const pending = { status: "pending" as const, verificationExpiresAt: null };
    expect(statusAfterVerificationDecision(pending, "approved", null, NOW)).toEqual({ status: "verified", statusReason: null, verified: true });
    expect(statusAfterVerificationDecision(pending, "rejected", "Unreadable", NOW)).toEqual({ status: "rejected", statusReason: "Unreadable", verified: false });
    expect(statusAfterVerificationDecision(pending, "changes_requested", "Add GST", NOW)).toEqual({ status: "draft", statusReason: "Add GST", verified: false });
    const renewal = { status: "verified" as const, verificationExpiresAt: new Date(NOW.getTime() + 10 * DAY) };
    expect(statusAfterVerificationDecision(renewal, "rejected", "Mismatch", NOW)).toEqual({ status: "verified", statusReason: "Mismatch", verified: false });
    const lapsed = { status: "verified" as const, verificationExpiresAt: new Date(NOW.getTime() - DAY) };
    expect(statusAfterVerificationDecision(lapsed, "changes_requested", "Renew", NOW).status).toBe("draft");
  });

  it("restores a sensible status after a suspension", () => {
    expect(statusAfterReactivation({ verifiedAt: null, verificationExpiresAt: null }, NOW)).toBe("draft");
    expect(statusAfterReactivation({ verifiedAt: new Date("2026-01-01"), verificationExpiresAt: null }, NOW)).toBe("verified");
    expect(statusAfterReactivation({ verifiedAt: new Date("2026-01-01"), verificationExpiresAt: new Date(NOW.getTime() + DAY) }, NOW)).toBe("verified");
    expect(statusAfterReactivation({ verifiedAt: new Date("2026-01-01"), verificationExpiresAt: new Date(NOW.getTime() - DAY) }, NOW)).toBe("expired");
  });
});

describe("verification expiry", () => {
  it("uses the earliest relevant document or verified licence expiry", () => {
    const expiry = computeVerificationExpiry({
      documents: [
        { reviewStatus: "accepted", expiresAt: new Date("2028-03-31T00:00:00Z") },
        { reviewStatus: "rejected", expiresAt: new Date("2026-12-01T00:00:00Z") },
        { reviewStatus: "pending", expiresAt: null },
      ],
      licences: [
        { verificationStatus: "verified", validUntil: "2027-06-30", deletedAt: null },
        { verificationStatus: "pending", validUntil: "2026-12-15", deletedAt: null },
        { verificationStatus: "verified", validUntil: "2026-12-20", deletedAt: new Date() },
      ],
    });
    expect(expiry?.toISOString()).toBe("2027-07-01T00:00:00.000Z");
    expect(computeVerificationExpiry({ documents: [{ reviewStatus: "accepted", expiresAt: null }], licences: [] })).toBeNull();
    expect(documentLapsesAt(new Date("2027-01-31T00:00:00Z")).toISOString()).toBe("2027-02-01T00:00:00.000Z");
  });

  it("sends the 30-day and the 7-day reminder once each", () => {
    const expiresAt = new Date(NOW.getTime() + 25 * DAY);
    expect(dueReminderThreshold(new Date(NOW.getTime() + 40 * DAY), null, NOW)).toBeNull();
    expect(dueReminderThreshold(expiresAt, null, NOW)).toBe(30);
    const sentAt = NOW;
    expect(dueReminderThreshold(expiresAt, sentAt, new Date(NOW.getTime() + 5 * DAY))).toBeNull();
    const nineteenDaysLater = new Date(NOW.getTime() + 19 * DAY); // 6 days left
    expect(dueReminderThreshold(expiresAt, sentAt, nineteenDaysLater)).toBe(7);
    expect(dueReminderThreshold(expiresAt, nineteenDaysLater, new Date(nineteenDaysLater.getTime() + DAY))).toBeNull();
    // First seen with 6 days left: only the 7-day reminder.
    expect(dueReminderThreshold(new Date(NOW.getTime() + 6 * DAY), null, NOW)).toBe(7);
    expect(dueReminderThreshold(new Date(NOW.getTime() - DAY), null, NOW)).toBeNull();
  });
});

describe("invitations", () => {
  const inv = { email: "Ravi.Kumar@Example.com", acceptedAt: null, revokedAt: null, expiresAt: new Date(NOW.getTime() + DAY) };
  const user = { email: "ravi.kumar@example.com", emailVerifiedAt: new Date("2026-10-01"), status: "active" };

  it("accepts the invited, verified, active user (case-insensitive email)", () => {
    expect(evaluateInvitationAcceptance(inv, user, NOW)).toEqual({ ok: true });
  });

  it("refuses used, cancelled and expired invitations", () => {
    expect(evaluateInvitationAcceptance({ ...inv, acceptedAt: NOW }, user, NOW)).toEqual({ ok: false, reason: "accepted" });
    expect(evaluateInvitationAcceptance({ ...inv, revokedAt: NOW }, user, NOW)).toEqual({ ok: false, reason: "revoked" });
    expect(evaluateInvitationAcceptance({ ...inv, expiresAt: NOW }, user, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(invitationStatus({ ...inv, expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe("expired");
  });

  it("reads the invitation validity from the setting, falling back to the default for unusable values", () => {
    expect(invitationTtlDays(14)).toBe(14);
    expect(invitationTtlDays("3")).toBe(3);
    expect(invitationTtlDays(2.9)).toBe(2);
    expect(invitationTtlDays(365)).toBe(90);
    for (const bad of [0, -1, Number.NaN, "", "soon", null, undefined]) expect(invitationTtlDays(bad)).toBe(INVITATION_TTL_DAYS);
  });

  it("refuses other accounts, unverified emails and inactive users", () => {
    expect(evaluateInvitationAcceptance(inv, { ...user, email: "someone@example.com" }, NOW)).toEqual({ ok: false, reason: "email_mismatch" });
    expect(evaluateInvitationAcceptance(inv, { ...user, email: null }, NOW)).toEqual({ ok: false, reason: "email_missing" });
    expect(evaluateInvitationAcceptance(inv, { ...user, emailVerifiedAt: null }, NOW)).toEqual({ ok: false, reason: "email_unverified" });
    expect(evaluateInvitationAcceptance(inv, { ...user, status: "suspended" }, NOW)).toEqual({ ok: false, reason: "user_inactive" });
  });
});

describe("roles", () => {
  const perms = new Set(["employer.dashboard", "employer.team.manage", "employer.jobs.view"]);

  it("prevents privilege escalation", () => {
    expect(canGrantRole({ isStaff: true, isOwner: false, permissions: new Set() }, { key: "owner", permissions: ["x"] })).toBe(true);
    expect(canGrantRole({ isStaff: false, isOwner: false, permissions: perms }, { key: "owner", permissions: [] })).toBe(false);
    expect(canGrantRole({ isStaff: false, isOwner: true, permissions: perms }, { key: "owner", permissions: [] })).toBe(true);
    expect(canGrantRole({ isStaff: false, isOwner: false, permissions: perms }, { key: "viewer", permissions: ["employer.dashboard", "employer.jobs.view"] })).toBe(true);
    expect(canGrantRole({ isStaff: false, isOwner: false, permissions: perms }, { key: "hr", permissions: ["employer.dashboard", "employer.billing.manage"] })).toBe(false);
  });

  it("lists permissions outside the scope catalogue", () => {
    expect(unknownPermissions(["a", "b"], ["a", "c", "c", "orgs.manage"])).toEqual(["c", "orgs.manage"]);
  });
});
