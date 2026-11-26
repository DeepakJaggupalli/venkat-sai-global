/**
 * Institution Portal dashboard figures against PostgreSQL (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_dashboard_institution
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_dashboard_institution npx vitest run "src/app/institution" --no-file-parallelism
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("institution dashboard data", async () => {
  if (!enabled) return;
  const { pool } = await import("@/db");
  const fx = await import("@/modules/organizations/testing");
  const orgService = await import("@/modules/organizations/service");
  const approvals = await import("@/modules/approvals/service");
  const courseService = await import("@/modules/training/courses");
  const batchService = await import("@/modules/training/batches");
  const enrolmentService = await import("@/modules/training/enrolments");
  const certService = await import("@/modules/training/certificates");
  const { getCandidateActor } = await import("@/modules/training/candidate");
  const { getInstitutionDashboardStats } = await import("@/modules/training/queries");
  const { dashboardTimeZone, getInstitutionDashboardData } = await import("./queries");
  const { monthKeyIn } = await import("./dashboard");
  type CourseInput = import("@/modules/training/schemas").CourseInput;
  type Ctx = Awaited<ReturnType<typeof fx.memberContext<"institution">>>;

  let staff: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    const staffUser = await fx.createUser({ isStaff: true, displayName: "Training Coordinator" });
    staff = fx.staffContext(staffUser, ["training.view", "training.manage", "training.certificates", "approvals.view", "approvals.decide", "orgs.verify"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function verifiedInstitution() {
    const owner = await fx.createUser({ displayName: "Principal Rao" });
    const org = await orgService.createOrganization("institution", { name: `Dashboard Institute ${randomUUID().slice(0, 6)}`, legalName: "Dashboard Institute Society", countryCode: "IN", city: "Visakhapatnam" }, owner);
    await fx.markOrganizationVerified(org.id);
    return { org, ctx: await fx.memberContext<"institution">(owner, org.id) };
  }

  function courseInput(overrides: Partial<CourseInput> = {}): CourseInput {
    return {
      title: `Welding ${randomUUID().slice(0, 6)}`,
      summary: "Practical welding training.",
      category: "welding",
      mode: "in_person",
      durationHours: 60,
      feeType: "free",
      certificationType: "completion_only",
      skillIds: [],
      outcomes: [],
      languageCodes: [],
      ...overrides,
    };
  }

  async function learner(name: string) {
    const { user } = await fx.createCandidate(await fx.createUser({ displayName: name }));
    return (await getCandidateActor(user.id))!;
  }

  async function publishedBatch(ctx: Ctx, capacity: number) {
    const course = await courseService.createCourse(ctx, courseInput());
    await courseService.addCourseModule(ctx, course.id, { title: "Module 1", materialFileIds: [] });
    const submitted = await courseService.submitCourseForPublication(ctx, course.id);
    if (submitted.approvalRequestId) await approvals.decideApproval({ requestId: submitted.approvalRequestId, decision: "approved", ctx: staff });
    const batch = await batchService.createBatch(ctx, course.id, { title: "Morning batch", mode: "in_person", capacity });
    await batchService.openBatch(ctx, batch.id);
    return { course, batch };
  }

  it("counts real seats, learners, applications, certificates and monthly figures, scoped to the institution", async () => {
    const { ctx } = await verifiedInstitution();
    const { org: otherOrg, ctx: otherCtx } = await verifiedInstitution();
    const now = new Date();

    // A fresh institution shows honest zeros.
    const empty = await getInstitutionDashboardData(ctx, { now });
    expect(empty).toMatchObject({ learners: 0, seats: { capacity: 0, filled: 0, batches: 0, withoutLimit: 0 }, readyForCertificate: 0, assessments: { total: 0, unpublished: 0 }, nextDrive: null });
    expect(empty.runningBatches).toEqual([]);
    expect(empty.recentApplications).toEqual([]);
    expect(empty.applicationsByMonth).toEqual([]);

    const { course, batch } = await publishedBatch(ctx, 5);
    const ravi = await learner("Ravi Kumar");
    const sita = await learner("Sita Devi");
    const first = await enrolmentService.applyToBatch(ravi, batch.id);
    await enrolmentService.applyToBatch(sita, batch.id);
    await enrolmentService.confirmEnrolment(ctx, first.id);
    await enrolmentService.completeEnrolment(ctx, first.id, { resultStatus: "not_applicable" });

    const data = await getInstitutionDashboardData(ctx, { now, timeZone: "Asia/Kolkata" });
    expect(data.learners).toBe(1);
    expect(data.enrolmentsByStatus).toMatchObject({ applied: 1, completed: 1 });
    expect(data.batchesByStatus).toEqual({ open: 1 });
    expect(data.seats).toEqual({ capacity: 5, filled: 1, batches: 1, withoutLimit: 0 });
    expect(data.upcomingBatches).toHaveLength(1);
    expect(data.upcomingBatches[0]).toMatchObject({ id: batch.id, courseTitle: course.title, capacity: 5, status: "open" });
    expect(data.readyForCertificate).toBe(1);
    expect(data.recentApplications.map((a) => a.candidateName).sort()).toEqual(["Ravi Kumar", "Sita Devi"]);
    expect(data.applicationsByMonth).toEqual([{ month: monthKeyIn(now, "Asia/Kolkata"), value: 2 }]);
    expect(data.recentCertificates).toEqual([]);

    // Issuing the certificate moves the learner from "ready" to the certificate list and chart.
    const cert = await certService.issueCertificate(ctx, { issuerType: "institution_completion", enrolmentId: first.id });
    const after = await getInstitutionDashboardData(ctx, { now });
    expect(after.readyForCertificate).toBe(0);
    expect(after.recentCertificates).toEqual([expect.objectContaining({ id: cert.id, holderName: "Ravi Kumar", status: "active" })]);
    expect(after.certificatesByMonth).toEqual([{ month: monthKeyIn(now), value: 1 }]);
    const stats = await getInstitutionDashboardStats(ctx, now);
    expect(stats.certificates.active).toBe(1);

    // Another institution sees none of it.
    expect(otherCtx.organization.id).toBe(otherOrg.id);
    const other = await getInstitutionDashboardData(otherCtx, { now });
    expect(other).toMatchObject({ learners: 0, readyForCertificate: 0, seats: { batches: 0 } });
    expect(other.recentApplications).toEqual([]);
    expect(other.recentCertificates).toEqual([]);
  });

  it("limits an instructor to the batches they are assigned to, and shows overview roles the whole institution", async () => {
    const { ctx } = await verifiedInstitution();
    const { batch } = await publishedBatch(ctx, 10);
    await enrolmentService.applyToBatch(await learner("Anil Babu"), batch.id);
    const as = (permissions: string[]): Ctx => ({ ...ctx, user: { ...ctx.user, id: randomUUID() }, permissions: new Set(permissions) });

    const instructor = await getInstitutionDashboardData(as(["institution.dashboard", "institution.students.manage", "institution.assessments.manage"]), { now: new Date() });
    expect(instructor.upcomingBatches).toEqual([]);
    expect(instructor.recentApplications).toEqual([]);
    expect(instructor.enrolmentsByStatus).toEqual({});
    expect(instructor.batchesByStatus).toEqual({});
    expect(instructor.seats.batches).toBe(0);

    const viewer = await getInstitutionDashboardData(as(["institution.dashboard", "institution.reports.view"]), { now: new Date() });
    expect(viewer.batchesByStatus).toEqual({ open: 1 });
    expect(viewer.enrolmentsByStatus).toEqual({ applied: 1 });
    expect(viewer.seats).toMatchObject({ capacity: 10, filled: 0, batches: 1 });
  });

  it("falls back to India time for an unusable time zone", () => {
    expect(dashboardTimeZone(null)).toBe("Asia/Kolkata");
    expect(dashboardTimeZone("Not/AZone")).toBe("Asia/Kolkata");
    expect(dashboardTimeZone("x'; drop table users; --")).toBe("Asia/Kolkata");
    expect(dashboardTimeZone("Asia/Dubai")).toBe("Asia/Dubai");
  });
});
