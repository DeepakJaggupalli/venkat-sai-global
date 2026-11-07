import { describe, expect, it } from "vitest";

import type { CertificateIssuerType } from "@/db/schema/training";

import {
  batchApplicationCheck,
  canTransitionBatch,
  canTransitionEnrolment,
  computeAttendancePercent,
  computeFinalResult,
  credentialTypeForCertificate,
  evaluateCertificateIssue,
  formatVerificationCode,
  initialEnrolmentStatus,
  normalizeVerificationCode,
  seatDelta,
  type CertificateIssuerActor,
  type CertificateSource,
} from "./rules";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const staffWithCerts: CertificateIssuerActor = { kind: "staff", permissions: new Set(["training.certificates", "training.manage"]) };
const staffWithoutCerts: CertificateIssuerActor = { kind: "staff", permissions: new Set(["training.manage"]) };
const institution = (o: Partial<Extract<CertificateIssuerActor, { kind: "institution" }>> = {}): CertificateIssuerActor => ({
  kind: "institution",
  organizationId: ORG,
  permissions: new Set(["institution.certificates.issue"]),
  organizationVerified: true,
  authorisedIssuer: false,
  ...o,
});

const passedTest: CertificateSource = { kind: "skill_assessment", status: "completed", result: "pass" };
const enrolment = (o: Partial<Extract<CertificateSource, { kind: "enrolment" }>> = {}): CertificateSource => ({
  kind: "enrolment",
  courseOrganizationId: ORG,
  batchOrganizationId: ORG,
  enrolmentStatus: "completed",
  resultStatus: "passed",
  certificationType: "completion_only",
  ...o,
});
const vsgEnrolment = (o: Partial<Extract<CertificateSource, { kind: "enrolment" }>> = {}) =>
  enrolment({ courseOrganizationId: null, batchOrganizationId: null, certificationType: "venkat_sai_assessment", ...o });

function check(issuerType: CertificateIssuerType, actor: CertificateIssuerActor, source: CertificateSource) {
  const r = evaluateCertificateIssue(issuerType, actor, source);
  return r.ok ? "ok" : r.reason;
}

describe("certificate issuing matrix", () => {
  it("venkat_sai: only staff with training.certificates, from passed Venkat Sai tests or courses", () => {
    expect(check("venkat_sai", staffWithCerts, passedTest)).toBe("ok");
    expect(check("venkat_sai", staffWithoutCerts, passedTest)).toBe("not_permitted");
    expect(check("venkat_sai", institution({ permissions: new Set(["institution.certificates.issue", "training.certificates"]) }), passedTest)).toBe("not_permitted");
    expect(check("venkat_sai", staffWithCerts, { kind: "skill_assessment", status: "completed", result: "fail" })).toBe("not_passed");
    expect(check("venkat_sai", staffWithCerts, { kind: "skill_assessment", status: "completed", result: "retest" })).toBe("not_passed");
    expect(check("venkat_sai", staffWithCerts, { kind: "skill_assessment", status: "scheduled", result: "pending" })).toBe("not_completed");

    expect(check("venkat_sai", staffWithCerts, vsgEnrolment())).toBe("ok");
    expect(check("venkat_sai", staffWithCerts, vsgEnrolment({ resultStatus: "failed" }))).toBe("not_passed");
    expect(check("venkat_sai", staffWithCerts, vsgEnrolment({ certificationType: "completion_only", resultStatus: "not_applicable" }))).toBe("ok");
    expect(check("venkat_sai", staffWithCerts, vsgEnrolment({ enrolmentStatus: "in_progress" }))).toBe("not_completed");
    expect(check("venkat_sai", staffWithCerts, vsgEnrolment({ certificationType: "none" }))).toBe("no_certificate_offered");
    // Never as a Venkat Sai certificate for an institution's course, nor for an accredited course.
    expect(check("venkat_sai", staffWithCerts, enrolment())).toBe("wrong_source");
    expect(check("venkat_sai", staffWithCerts, vsgEnrolment({ certificationType: "accredited_external" }))).toBe("certification_mismatch");
  });

  it("institution_completion: verified institution members with the permission, own completed enrolments", () => {
    expect(check("institution_completion", institution(), enrolment())).toBe("ok");
    expect(check("institution_completion", institution(), enrolment({ certificationType: "accredited_external", resultStatus: "failed" }))).toBe("ok");
    expect(check("institution_completion", institution({ permissions: new Set(["institution.courses.manage"]) }), enrolment())).toBe("not_permitted");
    expect(check("institution_completion", institution({ organizationVerified: false }), enrolment())).toBe("institution_not_verified");
    expect(check("institution_completion", institution(), enrolment({ courseOrganizationId: OTHER, batchOrganizationId: OTHER }))).toBe("not_course_owner");
    expect(check("institution_completion", institution(), enrolment({ batchOrganizationId: OTHER }))).toBe("not_course_owner");
    expect(check("institution_completion", institution(), enrolment({ enrolmentStatus: "confirmed" }))).toBe("not_completed");
    expect(check("institution_completion", institution(), enrolment({ certificationType: "none" }))).toBe("no_certificate_offered");
    expect(check("institution_completion", institution(), passedTest)).toBe("wrong_source");
    expect(check("institution_completion", staffWithCerts, enrolment())).toBe("not_permitted");
  });

  it("accredited_external: ONLY institutions authorised by Venkat Sai, for passed accredited courses", () => {
    const accredited = enrolment({ certificationType: "accredited_external", resultStatus: "passed" });
    expect(check("accredited_external", institution({ authorisedIssuer: true }), accredited)).toBe("ok");
    expect(check("accredited_external", institution({ authorisedIssuer: false }), accredited)).toBe("not_authorised_issuer");
    expect(check("accredited_external", staffWithCerts, accredited)).toBe("staff_cannot_issue_accredited");
    expect(check("accredited_external", institution({ authorisedIssuer: true }), enrolment({ certificationType: "completion_only" }))).toBe("certification_mismatch");
    expect(check("accredited_external", institution({ authorisedIssuer: true }), { ...accredited, resultStatus: "failed" } as CertificateSource)).toBe("not_passed");
    expect(check("accredited_external", institution({ authorisedIssuer: true, organizationVerified: false }), accredited)).toBe("institution_not_verified");
    expect(check("accredited_external", institution({ authorisedIssuer: true }), passedTest)).toBe("wrong_source");
  });

  it("maps credential types for the candidate profile", () => {
    expect(credentialTypeForCertificate({ fromSkillAssessment: true, certificationType: null })).toBe("skill_test");
    expect(credentialTypeForCertificate({ fromSkillAssessment: false, certificationType: "completion_only" })).toBe("training_completion");
    expect(credentialTypeForCertificate({ fromSkillAssessment: false, certificationType: "accredited_external" })).toBe("certificate");
  });
});

describe("verification codes", () => {
  it("normalises what people type and rejects anything else", () => {
    expect(normalizeVerificationCode("abcd-efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(normalizeVerificationCode(" 0O1I L234 5678 ")).toBe("001112345678");
    expect(normalizeVerificationCode("ABCD-EFGH")).toBeNull();
    expect(normalizeVerificationCode("ABCD-EFGH-JKMU")).toBeNull();
    expect(normalizeVerificationCode("'; drop table certificates; --")).toBeNull();
    expect(formatVerificationCode("ABCDEFGHJKMN")).toBe("ABCD-EFGH-JKMN");
  });
});

describe("enrolment and batch state machines", () => {
  it("allows only sensible transitions", () => {
    expect(canTransitionEnrolment("applied", "confirmed")).toBe(true);
    expect(canTransitionEnrolment("waitlisted", "confirmed")).toBe(true);
    expect(canTransitionEnrolment("confirmed", "completed")).toBe(true);
    expect(canTransitionEnrolment("completed", "cancelled")).toBe(false);
    expect(canTransitionEnrolment("rejected", "confirmed")).toBe(false);
    expect(canTransitionEnrolment("cancelled", "applied")).toBe(true);
    expect(canTransitionBatch("planned", "open")).toBe(true);
    expect(canTransitionBatch("completed", "open")).toBe(false);
    expect(canTransitionBatch("cancelled", "planned")).toBe(false);
  });

  it("counts seats for confirmed, in-progress and completed learners only", () => {
    expect(seatDelta("applied", "confirmed")).toBe(1);
    expect(seatDelta("waitlisted", "confirmed")).toBe(1);
    expect(seatDelta("confirmed", "in_progress")).toBe(0);
    expect(seatDelta("confirmed", "cancelled")).toBe(-1);
    expect(seatDelta("in_progress", "dropped")).toBe(-1);
    expect(seatDelta("applied", "rejected")).toBe(0);
  });

  it("waitlists new applications to a full batch and closes after the deadline", () => {
    expect(initialEnrolmentStatus({ status: "open", capacity: 10, enrolledCount: 9 })).toBe("applied");
    expect(initialEnrolmentStatus({ status: "open", capacity: 10, enrolledCount: 10 })).toBe("waitlisted");
    expect(initialEnrolmentStatus({ status: "full", capacity: null, enrolledCount: 0 })).toBe("waitlisted");
    expect(batchApplicationCheck({ status: "open", registrationDeadline: "2026-11-07", startsOn: null }, "2026-11-07").ok).toBe(true);
    expect(batchApplicationCheck({ status: "open", registrationDeadline: "2026-11-06", startsOn: null }, "2026-11-07").ok).toBe(false);
    expect(batchApplicationCheck({ status: "planned", registrationDeadline: null, startsOn: null }, "2026-11-07").ok).toBe(false);
  });
});

describe("attendance and results", () => {
  it("computes attendance with late as attended and excused not counted", () => {
    expect(computeAttendancePercent([])).toBeNull();
    expect(computeAttendancePercent(["excused"])).toBeNull();
    expect(computeAttendancePercent(["present", "late", "absent", "excused"])).toBe(66.67);
  });

  const assessments = [
    { id: "a", maxScore: 50, passScore: 25, weightPercent: 40 },
    { id: "b", maxScore: 100, passScore: 60, weightPercent: 60 },
  ];

  it("weights scores, requires every pass mark and stays pending with missing marks", () => {
    const pass = computeFinalResult(assessments, [{ assessmentId: "a", score: 40, isAbsent: false }, { assessmentId: "b", score: 70, isAbsent: false }], "venkat_sai_assessment");
    expect(pass).toEqual({ finalScore: 74, resultStatus: "passed", complete: true });
    const fail = computeFinalResult(assessments, [{ assessmentId: "a", score: 20, isAbsent: false }, { assessmentId: "b", score: 100, isAbsent: false }], "accredited_external");
    expect(fail.resultStatus).toBe("failed");
    const absent = computeFinalResult(assessments, [{ assessmentId: "a", score: null, isAbsent: true }, { assessmentId: "b", score: 100, isAbsent: false }], "accredited_external");
    expect(absent).toEqual({ finalScore: 60, resultStatus: "failed", complete: true });
    const missing = computeFinalResult(assessments, [{ assessmentId: "a", score: 40, isAbsent: false }], "accredited_external");
    expect(missing).toEqual({ finalScore: null, resultStatus: "pending", complete: false });
  });

  it("splits missing weights, never invents a pass mark, and marks completion-only courses not applicable", () => {
    const noWeights = [
      { id: "a", maxScore: 10, passScore: null, weightPercent: null },
      { id: "b", maxScore: 20, passScore: null, weightPercent: null },
    ];
    const r = computeFinalResult(noWeights, [{ assessmentId: "a", score: 5, isAbsent: false }, { assessmentId: "b", score: 20, isAbsent: false }], "venkat_sai_assessment");
    expect(r).toEqual({ finalScore: 75, resultStatus: "pending", complete: true });
    const completion = computeFinalResult(noWeights, [{ assessmentId: "a", score: 5, isAbsent: false }, { assessmentId: "b", score: 20, isAbsent: false }], "completion_only");
    expect(completion.resultStatus).toBe("not_applicable");
    expect(computeFinalResult([], [], "completion_only").resultStatus).toBe("not_applicable");
    const partial = computeFinalResult(
      [
        { id: "a", maxScore: 100, passScore: null, weightPercent: 80 },
        { id: "b", maxScore: 100, passScore: null, weightPercent: null },
      ],
      [{ assessmentId: "a", score: 50, isAbsent: false }, { assessmentId: "b", score: 100, isAbsent: false }],
      "venkat_sai_assessment",
    );
    expect(partial.finalScore).toBe(60);
  });
});
