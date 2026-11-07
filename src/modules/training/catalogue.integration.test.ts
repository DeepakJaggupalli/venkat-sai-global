/**
 * Public catalogue, dashboard, attendance / grading, campus drives, internships, placement outcomes and
 * the daily reminder task against PostgreSQL (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_orgs_training
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/training
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("training catalogue, delivery and reports", async () => {
  if (!enabled) return;
  const { eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { batches, enrolments, organizations } = await import("@/db/schema");
  const fx = await import("@/modules/organizations/testing");
  const orgService = await import("@/modules/organizations/service");
  const approvals = await import("@/modules/approvals/service");
  const courseService = await import("./courses");
  const batchService = await import("./batches");
  const enrolmentService = await import("./enrolments");
  const attendance = await import("./attendance");
  const grading = await import("./grading");
  const campus = await import("./campus");
  const internships = await import("./internships");
  const outcomes = await import("./outcomes");
  const queries = await import("./queries");
  const { runBatchReminders } = await import("./tasks");
  const { getCandidateActor } = await import("./candidate");

  const page = { page: 1, pageSize: 50, offset: 0 };
  let staff: ReturnType<typeof fx.staffContext>;
  let ctx: Awaited<ReturnType<typeof fx.memberContext<"institution">>>;
  let orgId: string;
  let orgSlug: string;
  let courseSlug: string;
  let courseId: string;
  let batchId: string;
  const tag = randomUUID().slice(0, 6);

  async function learner(name: string) {
    const { user } = await fx.createCandidate(await fx.createUser({ displayName: name }));
    return (await getCandidateActor(user.id))!;
  }

  beforeAll(async () => {
    await fx.seedReferenceData();
    staff = fx.staffContext(await fx.createUser({ isStaff: true }), ["approvals.view", "approvals.decide", "training.view", "training.manage", "training.certificates"]);
    const owner = await fx.createUser({ displayName: "Coordinator" });
    const org = await orgService.createOrganization("institution", { name: `Polytechnic ${tag}`, countryCode: "IN", city: "Visakhapatnam" }, owner);
    await fx.markOrganizationVerified(org.id);
    orgId = org.id;
    orgSlug = org.slug;
    ctx = await fx.memberContext<"institution">(owner, org.id);
    const course = await courseService.createCourse(ctx, {
      title: `Pipe fitting ${tag}`,
      summary: "Industrial pipe fitting for refinery projects.",
      category: "industrial",
      mode: "in_person",
      durationWeeks: 6,
      feeType: "fixed",
      feeAmount: 4500,
      feeCurrency: "INR",
      certificationType: "venkat_sai_assessment",
      skillIds: [],
      outcomes: ["Read isometric drawings"],
      languageCodes: [],
    });
    courseSlug = course.slug;
    courseId = course.id;
    expect(course).toMatchObject({ feeMinor: 450_000, feeCurrency: "INR" });
    await courseService.addCourseModule(ctx, course.id, { title: "Isometrics", materialFileIds: [] });
    const submitted = await courseService.submitCourseForPublication(ctx, course.id);
    await approvals.decideApproval({ requestId: submitted.approvalRequestId!, decision: "approved", ctx: staff });
    const batch = await batchService.createBatch(ctx, course.id, { title: "Weekday batch", mode: "in_person", capacity: 20, countryCode: "IN", city: "Visakhapatnam", startsOn: "2027-02-01" });
    await batchService.openBatch(ctx, batch.id);
    batchId = batch.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("lists published courses with their next open batch and supports filters", async () => {
    const all = await queries.listPublicCourses({ q: `pipe fitting ${tag}` }, page);
    const item = all.items.find((c) => c.slug === courseSlug);
    expect(item).toMatchObject({ provider: { kind: "institution", slug: orgSlug }, openBatchCount: 1, nextBatch: { id: batchId, seatsLeft: 20 } });
    expect((await queries.listPublicCourses({ institution: orgSlug, category: "industrial", city: "visakhapatnam", openBatchesOnly: true }, page)).items.map((c) => c.slug)).toContain(courseSlug);
    expect((await queries.listPublicCourses({ institution: orgSlug, category: "welding" }, page)).items).toHaveLength(0);
    expect((await queries.listPublicCourses({ venkatSaiOnly: true, q: tag }, page)).items).toHaveLength(0);

    const detail = await queries.getPublicCourse(courseSlug);
    expect(detail).toMatchObject({ slug: courseSlug, modules: [expect.objectContaining({ title: "Isometrics" })], batches: [expect.objectContaining({ id: batchId })] });

    // A suspended (no longer verified) institution disappears from the catalogue.
    await db.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, orgId));
    expect(await queries.getPublicCourse(courseSlug)).toBeNull();
    await db.update(organizations).set({ status: "verified" }).where(eq(organizations.id, orgId));
  });

  it("takes attendance, grades, computes results and reports live dashboard counts", async () => {
    const a = await learner("Learner A");
    const b = await learner("Learner B");
    const ea = await enrolmentService.applyToBatch(a, batchId);
    const eb = await enrolmentService.applyToBatch(b, batchId);
    expect(ea).toMatchObject({ feeStatus: "pending", feeMinor: 450_000, feeCurrency: "INR", resultStatus: "pending" });
    await enrolmentService.confirmEnrolment(ctx, ea.id);
    await enrolmentService.confirmEnrolment(ctx, eb.id);
    await enrolmentService.updateEnrolmentFee(ctx, ea.id, { feeStatus: "paid", paymentReference: "Receipt 1042" });

    const s1 = await attendance.createAttendanceSession(ctx, batchId, { sessionDate: "2027-02-01", topic: "Isometrics" });
    const s2 = await attendance.createAttendanceSession(ctx, batchId, { sessionDate: "2027-02-02" });
    await attendance.recordAttendance(ctx, s1.id, [
      { enrolmentId: ea.id, status: "present" },
      { enrolmentId: eb.id, status: "absent" },
    ]);
    await attendance.recordAttendance(ctx, s2.id, [
      { enrolmentId: ea.id, status: "late" },
      { enrolmentId: eb.id, status: "present" },
    ]);
    const [ra] = await db.select().from(enrolments).where(eq(enrolments.id, ea.id));
    const [rb] = await db.select().from(enrolments).where(eq(enrolments.id, eb.id));
    expect(ra!.attendancePercent).toBe(100);
    expect(rb!.attendancePercent).toBe(50);

    const theory = await grading.createCourseAssessment(ctx, batchId, { title: "Theory", type: "theory", maxScore: 50, passScore: 25, weightPercent: 40 });
    const practical = await grading.createCourseAssessment(ctx, batchId, { title: "Practical", type: "practical", maxScore: 100, passScore: 60, weightPercent: 60 });
    await grading.recordAssessmentScores(ctx, theory.id, [
      { enrolmentId: ea.id, score: 40, isAbsent: false },
      { enrolmentId: eb.id, score: 20, isAbsent: false },
    ]);
    await expect(grading.recordAssessmentScores(ctx, practical.id, [{ enrolmentId: ea.id, score: 120, isAbsent: false }])).rejects.toMatchObject({ code: "validation" });
    await grading.recordAssessmentScores(ctx, practical.id, [{ enrolmentId: ea.id, score: 70, isAbsent: false }]);
    const computed = await grading.computeBatchResults(ctx, batchId);
    expect(computed).toEqual({ updated: 2, incomplete: 1 });
    const [ga] = await db.select().from(enrolments).where(eq(enrolments.id, ea.id));
    expect(ga).toMatchObject({ finalScore: 74, resultStatus: "passed" });
    await grading.publishAssessmentResults(ctx, theory.id);
    expect(await grading.listPublishedScoresForEnrolment(ea.id)).toEqual([expect.objectContaining({ score: expect.objectContaining({ score: 40 }) })]);

    const stats = await queries.getInstitutionDashboardStats(ctx);
    expect(stats.courses.published).toBe(1);
    expect(stats.batches.open).toBe(1);
    expect(stats.enrolments.active).toBe(2);
    expect(stats.upcomingBatches.map((x) => x.id)).toContain(batchId);
    expect(stats.isAuthorisedCertificateIssuer).toBe(false);

    const roster = await queries.listBatchEnrolments(ctx, batchId);
    expect(roster.map((r) => r.candidateName).sort()).toEqual(["Learner A", "Learner B"]);
    expect((await queries.listCandidateEnrolments(a))[0]).toMatchObject({ course: { id: courseId }, providerName: `Polytechnic ${tag}` });
    expect((await queries.listCourses(ctx, {}, page)).items.map((c) => c.id)).toContain(courseId);
    expect((await queries.listBatches(staff, { organizationId: orgId }, page)).items.map((x) => x.id)).toContain(batchId);
  });

  it("runs campus drives, internships and placement outcomes", async () => {
    const drive = await campus.createCampusDrive(ctx, { title: `Refinery hiring day ${tag}`, mode: "in_person", jobIds: [], isPublic: true, capacity: 2, driveDate: "2027-03-15" });
    await campus.setCampusDriveStatus(ctx, drive.id, "open");
    const c1 = await learner("Drive One");
    const c2 = await learner("Drive Two");
    const c3 = await learner("Drive Three");
    const r1 = await campus.registerForCampusDrive(c1, drive.id, { consentToShare: false });
    await campus.registerForCampusDrive(c2, drive.id, { consentToShare: false });
    await expect(campus.registerForCampusDrive(c3, drive.id, { consentToShare: false })).rejects.toThrow(/full/);
    await campus.withdrawCampusDriveRegistration(c1, r1.id);
    await campus.registerForCampusDrive(c3, drive.id, { consentToShare: false });
    expect((await campus.listPublicCampusDrives(page)).items.find((d) => d.id === drive.id)).toMatchObject({ spotsLeft: 0, organizerName: `Polytechnic ${tag}` });
    expect((await campus.listCampusDrives(ctx, {}, page)).items.find((d) => d.id === drive.id)).toMatchObject({ registrationCount: 2 });
    expect((await campus.listDriveRegistrations(ctx, drive.id)).map((r) => r.status).sort()).toEqual(["registered", "registered", "withdrawn"]);

    const programme = await internships.createInternship(ctx, { title: `Fabrication internship ${tag}`, stipendType: "fixed", stipendAmount: 8000, stipendCurrency: "INR", stipendPeriod: "month" });
    expect(programme).toMatchObject({ stipendMinor: 800_000, stipendCurrency: "INR", status: "draft" });
    await internships.setInternshipStatus(ctx, programme.id, "open");
    expect((await internships.listPublicInternships(page)).items.map((p) => p.id)).toContain(programme.id);

    // Outcomes: only for the institution's own learners; verification needs evidence.
    const [someEnrolment] = await db.select().from(enrolments).innerJoin(batches, eq(batches.id, enrolments.batchId)).where(eq(batches.organizationId, orgId)).limit(1);
    const outcome = await outcomes.recordPlacementOutcome(ctx, {
      enrolmentId: someEnrolment!.enrolments.id,
      sourceType: "institution",
      employerName: "Coastal Fabricators",
      jobTitle: "Pipe fitter",
      placedOn: "2027-04-01",
      salaryAmount: 22000,
      salaryCurrency: "INR",
      salaryPeriod: "month",
    });
    expect(outcome).toMatchObject({ verified: false, salaryMinor: 2_200_000 });
    const outsider = await learner("Not a learner");
    await expect(outcomes.recordPlacementOutcome(ctx, { candidateId: outsider.candidateId, sourceType: "self", employerName: "X", jobTitle: "Y", placedOn: "2027-04-01" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(outcomes.verifyPlacementOutcome(staff, outcome.id, true)).rejects.toMatchObject({ code: "invalid_state" });
    expect((await outcomes.listPlacementOutcomes(ctx, {}, page)).total).toBeGreaterThanOrEqual(1);
  });

  it("starts due batches and sends reminders from the daily task", async () => {
    // Move the batch to start tomorrow relative to a simulated "now".
    const now = new Date("2027-01-30T06:00:00Z");
    const result = await runBatchReminders(now);
    expect(result.batchReminders).toBeGreaterThanOrEqual(2);
    const started = await runBatchReminders(new Date("2027-02-01T06:00:00Z"));
    expect(started.batchesStarted).toBeGreaterThanOrEqual(1);
    const [batch] = await db.select().from(batches).where(eq(batches.id, batchId));
    expect(batch!.status).toBe("in_progress");
    const confirmed = await db.select().from(enrolments).where(eq(enrolments.batchId, batchId));
    expect(confirmed.filter((e) => e.status === "in_progress")).toHaveLength(2);
  });
});
