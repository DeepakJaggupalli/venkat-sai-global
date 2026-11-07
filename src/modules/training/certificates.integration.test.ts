/**
 * Certificate issuing rules, skill assessments and public verification against PostgreSQL
 * (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_orgs_training
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/training
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("certificates and skill assessments", async () => {
  if (!enabled) return;
  const { eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { candidateCredentials, candidateProfiles, candidateSkills, certificates, skills } = await import("@/db/schema");
  const fx = await import("@/modules/organizations/testing");
  const orgService = await import("@/modules/organizations/service");
  const institutionService = await import("@/modules/organizations/institution");
  const approvals = await import("@/modules/approvals/service");
  const courseService = await import("./courses");
  const batchService = await import("./batches");
  const enrolmentService = await import("./enrolments");
  const certService = await import("./certificates");
  const centres = await import("./centres");
  const assessments = await import("./skill-assessments");
  const { getCandidateActor } = await import("./candidate");
  type CourseInput = import("./schemas").CourseInput;

  let staff: ReturnType<typeof fx.staffContext>;
  let trainingManagerOnly: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    const staffUser = await fx.createUser({ isStaff: true, displayName: "Training Coordinator" });
    staff = fx.staffContext(staffUser, ["training.view", "training.manage", "training.certificates", "recruitment.assessments", "approvals.view", "approvals.decide", "orgs.verify"]);
    trainingManagerOnly = fx.staffContext(staffUser, ["training.view", "training.manage"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  function courseInput(overrides: Partial<CourseInput> = {}): CourseInput {
    return {
      title: `Course ${randomUUID().slice(0, 6)}`,
      summary: "Practical training.",
      category: "welding",
      mode: "in_person",
      durationHours: 60,
      feeType: "free",
      certificationType: "venkat_sai_assessment",
      skillIds: [],
      outcomes: [],
      languageCodes: [],
      ...overrides,
    };
  }

  async function learner() {
    const { user } = await fx.createCandidate(await fx.createUser({ displayName: "Ravi Kumar" }));
    return (await getCandidateActor(user.id))!;
  }

  /** Publish, schedule, enrol, confirm and complete one learner. */
  async function completedEnrolment(actor: Parameters<typeof courseService.createCourse>[0], input: CourseInput, result: "passed" | "failed" | "not_applicable" = "passed") {
    const course = await courseService.createCourse(actor, input);
    await courseService.addCourseModule(actor, course.id, { title: "Module 1", materialFileIds: [] });
    const submitted = await courseService.submitCourseForPublication(actor, course.id);
    if (submitted.approvalRequestId) await approvals.decideApproval({ requestId: submitted.approvalRequestId, decision: "approved", ctx: staff });
    const batch = await batchService.createBatch(actor, course.id, { title: "Batch A", mode: "in_person", capacity: 5 });
    await batchService.openBatch(actor, batch.id);
    const candidate = await learner();
    const enrolment = await enrolmentService.applyToBatch(candidate, batch.id);
    await enrolmentService.confirmEnrolment(actor, enrolment.id);
    await enrolmentService.completeEnrolment(actor, enrolment.id, { resultStatus: result });
    return { course, batch, candidate, enrolment };
  }

  async function verifiedInstitution() {
    const owner = await fx.createUser({ displayName: "Principal" });
    const org = await orgService.createOrganization("institution", { name: `Technical Institute ${Date.now()}`, legalName: "Technical Institute Society", countryCode: "IN", city: "Visakhapatnam" }, owner);
    await fx.markOrganizationVerified(org.id);
    return { owner, org, ctx: await fx.memberContext<"institution">(owner, org.id) };
  }

  it("issues Venkat Sai certificates for its own courses, with a credential, a public check and revocation", async () => {
    const { candidate, enrolment } = await completedEnrolment(staff, courseInput());
    await expect(certService.issueCertificate(trainingManagerOnly, { issuerType: "venkat_sai", enrolmentId: enrolment.id })).rejects.toMatchObject({ code: "certificate_not_permitted" });

    const cert = await certService.issueCertificate(staff, { issuerType: "venkat_sai", enrolmentId: enrolment.id, expiresOn: "2029-12-31" });
    expect(cert).toMatchObject({ issuerType: "venkat_sai", issuerOrganizationId: null, holderName: "Ravi Kumar", status: "active" });
    expect(cert.code).toMatch(/^VSG-CRT-\d{6}$/);
    expect(cert.verificationCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    const [credential] = await db.select().from(candidateCredentials).where(eq(candidateCredentials.certificateId, cert.id));
    expect(credential).toMatchObject({ candidateId: candidate.candidateId, issuerType: "venkat_sai", verificationStatus: "verified", credentialType: "certificate", credentialNumber: cert.code });

    const check = await certService.verifyCertificateByCode(cert.verificationCode.toLowerCase().replace(/(.{4})/g, "$1-"));
    expect(check).toMatchObject({ found: true, status: "valid", holderName: "Ravi Kumar", issuerType: "venkat_sai", expiresOn: "2029-12-31", accreditationBody: null });
    expect(check.found && check.issuerTypeLabel).toMatch(/not an external accreditation/);
    expect(Object.keys(check)).not.toContain("candidateId");
    expect(await certService.verifyCertificateByCode("0000-0000-0000")).toEqual({ found: false });

    await expect(certService.issueCertificate(staff, { issuerType: "venkat_sai", enrolmentId: enrolment.id })).rejects.toMatchObject({ code: "conflict" });

    await certService.revokeCertificate(staff, cert.id, "Issued to the wrong batch.");
    expect(await certService.verifyCertificateByCode(cert.verificationCode)).toMatchObject({ found: true, status: "revoked" });
    const [revokedCredential] = await db.select().from(candidateCredentials).where(eq(candidateCredentials.certificateId, cert.id));
    expect(revokedCredential!.verificationStatus).toBe("rejected");

    // After revocation a corrected certificate can be issued; the holder can hide the public check.
    const second = await certService.issueCertificate(staff, { issuerType: "venkat_sai", enrolmentId: enrolment.id });
    await certService.setCertificatePublicVerification(candidate, second.id, false);
    expect(await certService.verifyCertificateByCode(second.verificationCode)).toEqual({ found: false });
  });

  it("refuses certificates for failed or Venkat Sai results presented as accredited", async () => {
    const failed = await completedEnrolment(staff, courseInput(), "failed");
    await expect(certService.issueCertificate(staff, { issuerType: "venkat_sai", enrolmentId: failed.enrolment.id })).rejects.toMatchObject({ code: "certificate_not_passed" });
    await expect(certService.issueCertificate(staff, { issuerType: "accredited_external", enrolmentId: failed.enrolment.id })).rejects.toMatchObject({
      code: "certificate_staff_cannot_issue_accredited",
    });
  });

  it("lets verified institutions issue completion certificates, and accredited ones only once authorised", async () => {
    const { ctx, org } = await verifiedInstitution();
    const completion = await completedEnrolment(ctx, courseInput({ certificationType: "completion_only" }), "not_applicable");
    const cert = await certService.issueCertificate(ctx, { issuerType: "institution_completion", enrolmentId: completion.enrolment.id });
    expect(cert).toMatchObject({ issuerType: "institution_completion", issuerOrganizationId: org.id, issuerName: "Technical Institute Society" });
    // The completion certificate is mirrored on the profile as a verified, institution-issued credential.
    expect(certService.credentialIssuerTypeFor("institution_completion")).toBe("institution");
    const credentials = await db.select().from(candidateCredentials).where(eq(candidateCredentials.certificateId, cert.id));
    expect(credentials).toHaveLength(1);
    expect(credentials[0]).toMatchObject({ issuerType: "institution", issuer: "Technical Institute Society", verificationStatus: "verified", credentialNumber: cert.code });
    // Like Venkat Sai certificates, it is read-only on the profile.
    const { deleteCandidateCredential } = await import("@/modules/candidates/documents-service");
    const { staffActor } = await import("@/modules/candidates/actor");
    const profileEditor = staffActor(fx.staffContext(staff.user, ["candidates.view", "candidates.manage"]), credentials[0]!.candidateId);
    await expect(deleteCandidateCredential(profileEditor, credentials[0]!.id)).rejects.toMatchObject({ code: "credential_locked" });
    // Venkat Sai certificates are never issued by institutions.
    await expect(certService.issueCertificate(ctx, { issuerType: "venkat_sai", enrolmentId: completion.enrolment.id })).rejects.toMatchObject({ code: "certificate_not_permitted" });

    // An accredited course cannot even be published before the institution is authorised.
    const accreditedInput = courseInput({ certificationType: "accredited_external", accreditationBody: "National Council for Vocational Training" });
    const draft = await courseService.createCourse(ctx, accreditedInput);
    await courseService.addCourseModule(ctx, draft.id, { title: "Module 1", materialFileIds: [] });
    await expect(courseService.submitCourseForPublication(ctx, draft.id)).rejects.toThrow(/authorised by Venkat Sai/);

    await institutionService.setCertificateIssuerAuthorisation(staff, { organizationId: org.id, authorised: true, scope: "NCVT trade certificates in welding", authorisedUntil: "2030-03-31" });
    const accredited = await completedEnrolment(ctx, accreditedInput, "passed");
    const accreditedCert = await certService.issueCertificate(ctx, { issuerType: "accredited_external", enrolmentId: accredited.enrolment.id });
    expect(accreditedCert).toMatchObject({ issuerType: "accredited_external", accreditationBody: "National Council for Vocational Training" });
    const [credential] = await db.select().from(candidateCredentials).where(eq(candidateCredentials.certificateId, accreditedCert.id));
    expect(credential).toMatchObject({ issuerType: "accredited_external", verificationStatus: "verified" });

    // Withdrawn authorisation: no more accredited certificates.
    await institutionService.setCertificateIssuerAuthorisation(staff, { organizationId: org.id, authorised: false });
    await certService.revokeCertificate(ctx, accreditedCert.id, "Re-issue test");
    await expect(certService.issueCertificate(ctx, { issuerType: "accredited_external", enrolmentId: accredited.enrolment.id })).rejects.toMatchObject({ code: "certificate_not_authorised_issuer" });

    // Another institution cannot touch these certificates.
    const other = await verifiedInstitution();
    await expect(certService.revokeCertificate(other.ctx, cert.id, "Not ours")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("records a passed skill assessment: verified skill, skills_assessed level and an optional certificate", async () => {
    const centre = await centres.createAssessmentCentre(staff, { name: `Auto Nagar Workshop ${randomUUID().slice(0, 4)}`, countryCode: "IN", city: "Visakhapatnam", capabilities: ["SMAW", "GTAW", "Pipe 6G"] });
    const [skill] = await db.insert(skills).values({ slug: `gtaw-${randomUUID().slice(0, 8)}`, name: "GTAW (TIG) welding", category: "trade" }).returning();
    const candidate = await learner();
    const since = new Date(Date.now() - 1000);
    const scheduled = await assessments.scheduleSkillAssessment(staff, {
      candidateId: candidate.candidateId,
      assessmentCentreId: centre.id,
      trade: "Pipe welder",
      skillId: skill!.id,
      assessmentType: "trade_test",
      process: "GTAW",
      position: "6G",
      standardReference: "ASME IX",
      evaluationMethods: ["visual", "bend test"],
      scheduledAt: new Date(Date.now() + 2 * 86_400_000),
      maxScore: 100,
    });
    expect(scheduled).toMatchObject({ status: "scheduled", result: "pending", attemptNumber: 1 });
    expect((await fx.tasksSince(since, "notifications.dispatch")).some((t) => t.payload.event === "assessment.scheduled")).toBe(true);

    // The candidate sees no result before it is published.
    expect((await assessments.listCandidateSkillAssessments(candidate))[0]).toMatchObject({ result: null, score: null });

    const { certificate } = await assessments.recordSkillAssessmentResult(staff, {
      assessmentId: scheduled.id,
      result: "pass",
      score: 86,
      remarks: "Clean root pass.",
      internalNotes: "Assessor: workshop lead.",
      evidenceFileIds: [],
      publish: true,
      verifySkill: true,
      issueCertificate: true,
    });
    expect(certificate).toMatchObject({ issuerType: "venkat_sai", skillAssessmentId: scheduled.id });
    expect(certificate!.title).toContain("Pipe welder");
    const [candidateSkill] = await db.select().from(candidateSkills).where(eq(candidateSkills.candidateId, candidate.candidateId));
    expect(candidateSkill).toMatchObject({ skillId: skill!.id, source: "assessment", verified: true, skillAssessmentId: scheduled.id });
    const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.id, candidate.candidateId));
    expect(profile).toMatchObject({ verificationLevel: "skills_assessed", skillNamesCache: ["GTAW (TIG) welding"] });
    const [credential] = await db.select().from(candidateCredentials).where(eq(candidateCredentials.certificateId, certificate!.id));
    expect(credential).toMatchObject({ credentialType: "skill_test", issuerType: "venkat_sai" });
    const visible = (await assessments.listCandidateSkillAssessments(candidate))[0]!;
    expect(visible).toMatchObject({ result: "pass", score: 86, remarks: "Clean root pass." });
    expect(visible).not.toHaveProperty("internalNotes");

    // A pass cannot be corrected while its certificate is active; after revocation it can, and the skill is unverified.
    const correction = { assessmentId: scheduled.id, result: "fail" as const, evidenceFileIds: [], publish: true, verifySkill: true, issueCertificate: false };
    await expect(assessments.recordSkillAssessmentResult(staff, correction)).rejects.toMatchObject({ code: "invalid_state" });
    await certService.revokeCertificate(staff, certificate!.id, "Weld failed radiography after the visual check.");
    await assessments.recordSkillAssessmentResult(staff, { ...correction, retestAvailableFrom: "2026-12-01" });
    const [after] = await db.select().from(candidateSkills).where(eq(candidateSkills.candidateId, candidate.candidateId));
    expect(after!.verified).toBe(false);

    // A retest chains to the failed attempt.
    const retest = await assessments.scheduleSkillAssessment(staff, {
      candidateId: candidate.candidateId,
      assessmentCentreId: centre.id,
      trade: "Pipe welder",
      assessmentType: "trade_test",
      evaluationMethods: [],
      scheduledAt: new Date("2026-12-05T04:00:00Z"),
      retestOfAssessmentId: scheduled.id,
    });
    expect(retest.attemptNumber).toBe(2);
    const [stored] = await db.select().from(certificates).where(eq(certificates.id, certificate!.id));
    expect(stored!.status).toBe("revoked");
  });
});
