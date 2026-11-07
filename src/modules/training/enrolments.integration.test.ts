/**
 * Enrolment flow and capacity enforcement against PostgreSQL (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_orgs_training
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/training
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("training enrolments", async () => {
  if (!enabled) return;
  const { and, eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { approvalRequests, batches, courses, enrolments, organizationMembers } = await import("@/db/schema");
  const fx = await import("@/modules/organizations/testing");
  const orgService = await import("@/modules/organizations/service");
  const approvals = await import("@/modules/approvals/service");
  const courseService = await import("./courses");
  const batchService = await import("./batches");
  const enrolmentService = await import("./enrolments");
  const { getCandidateActor } = await import("./candidate");

  let reviewer: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    reviewer = fx.staffContext(await fx.createUser({ isStaff: true }), ["approvals.view", "approvals.decide", "training.manage", "training.view"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function institutionWithOpenBatch(capacity: number) {
    const owner = await fx.createUser({ displayName: "Institution Owner" });
    const org = await orgService.createOrganization("institution", { name: `Weld Academy ${Date.now()}`, countryCode: "IN", city: "Visakhapatnam" }, owner);
    await fx.markOrganizationVerified(org.id);
    const ctx = await fx.memberContext<"institution">(owner, org.id);
    const course = await courseService.createCourse(ctx, {
      title: `SMAW welding basics ${Date.now()}`,
      summary: "Shielded metal arc welding for beginners.",
      category: "welding",
      mode: "in_person",
      durationHours: 80,
      feeType: "free",
      certificationType: "completion_only",
      skillIds: [],
      outcomes: ["Weld 1G and 2G plate joints"],
      languageCodes: [],
    });
    await courseService.addCourseModule(ctx, course.id, { title: "Safety and equipment", materialFileIds: [] });
    const submitted = await courseService.submitCourseForPublication(ctx, course.id);
    expect(submitted.status).toBe("pending_approval");
    await approvals.decideApproval({ requestId: submitted.approvalRequestId!, decision: "approved", ctx: reviewer });
    const [published] = await db.select().from(courses).where(eq(courses.id, course.id));
    expect(published).toMatchObject({ status: "published" });
    expect(published!.publishedAt).toBeInstanceOf(Date);
    const batch = await batchService.createBatch(ctx, course.id, { title: "Morning batch", mode: "in_person", capacity, startsOn: "2027-01-10" });
    await batchService.openBatch(ctx, batch.id);
    return { owner, org, ctx, course, batch };
  }

  async function candidates(n: number) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const { user } = await fx.createCandidate(await fx.createUser({ displayName: `Learner ${i + 1}` }));
      out.push((await getCandidateActor(user.id))!);
    }
    return out;
  }

  async function batchRow(id: string) {
    const [row] = await db.select().from(batches).where(eq(batches.id, id));
    return row!;
  }

  it("never confirms more learners than the capacity, even concurrently", async () => {
    const { ctx, batch } = await institutionWithOpenBatch(2);
    const learners = await candidates(5);
    const applied = [];
    for (const learner of learners) applied.push(await enrolmentService.applyToBatch(learner, batch.id));
    expect(applied.every((e) => e.status === "applied")).toBe(true);

    const results = await Promise.allSettled(applied.map((e) => enrolmentService.confirmEnrolment(ctx, e.id)));
    const confirmed = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(confirmed).toHaveLength(2);
    expect(refused).toHaveLength(3);
    for (const r of refused) expect(String(r.reason?.message)).toMatch(/full/i);

    const after = await batchRow(batch.id);
    expect(after).toMatchObject({ enrolledCount: 2, status: "full" });
    const rows = await db.select().from(enrolments).where(eq(enrolments.batchId, batch.id));
    expect(rows.filter((r) => r.status === "confirmed")).toHaveLength(2);

    // A new applicant to a full batch goes straight to the waitlist.
    const [late] = await candidates(1);
    const waitlisted = await enrolmentService.applyToBatch(late!, batch.id);
    expect(waitlisted.status).toBe("waitlisted");
    await expect(enrolmentService.confirmEnrolment(ctx, waitlisted.id)).rejects.toThrow(/full/i);

    // Cancelling a confirmed learner frees the seat and re-opens the batch.
    const firstConfirmed = rows.find((r) => r.status === "confirmed")!;
    await enrolmentService.cancelEnrolment(ctx, firstConfirmed.id, "Did not submit the fee receipt.");
    expect(await batchRow(batch.id)).toMatchObject({ enrolledCount: 1, status: "open" });
    await enrolmentService.confirmEnrolment(ctx, waitlisted.id);
    expect(await batchRow(batch.id)).toMatchObject({ enrolledCount: 2, status: "full" });
  });

  it("handles duplicates, re-applications and candidate withdrawal", async () => {
    const { ctx, batch } = await institutionWithOpenBatch(10);
    const [learner] = await candidates(1);
    const first = await enrolmentService.applyToBatch(learner!, batch.id);
    await expect(enrolmentService.applyToBatch(learner!, batch.id)).rejects.toMatchObject({ code: "conflict" });
    await enrolmentService.confirmEnrolment(ctx, first.id);
    expect((await batchRow(batch.id)).enrolledCount).toBe(1);
    await enrolmentService.withdrawEnrolment(learner!, first.id);
    expect((await batchRow(batch.id)).enrolledCount).toBe(0);
    const again = await enrolmentService.applyToBatch(learner!, batch.id);
    expect(again.id).toBe(first.id);
    expect(again.status).toBe("applied");
    // Other candidates cannot withdraw someone else's enrolment.
    const [stranger] = await candidates(1);
    await expect(enrolmentService.withdrawEnrolment(stranger!, first.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("scopes institution staff: other institutions and unassigned instructors are refused", async () => {
    const a = await institutionWithOpenBatch(5);
    const b = await institutionWithOpenBatch(5);
    const [learner] = await candidates(1);
    const enrolment = await enrolmentService.applyToBatch(learner!, a.batch.id);
    await expect(enrolmentService.confirmEnrolment(b.ctx, enrolment.id)).rejects.toMatchObject({ code: "forbidden" });

    // An instructor (institution.students.manage, no batches.manage) must be assigned to the batch.
    const instructorUser = await fx.createUser({ displayName: "Instructor" });
    await db.insert(organizationMembers).values({
      organizationId: a.org.id,
      userId: instructorUser.id,
      roleId: await fx.templateRoleId("institution", "instructor"),
      status: "active",
    });
    const instructorCtx = await fx.memberContext<"institution">(instructorUser, a.org.id);
    await expect(enrolmentService.confirmEnrolment(instructorCtx, enrolment.id)).rejects.toMatchObject({ code: "forbidden" });
    await batchService.addBatchInstructor(a.ctx, a.batch.id, { userId: instructorUser.id, role: "lead" });
    await enrolmentService.confirmEnrolment(instructorCtx, enrolment.id);
    expect((await batchRow(a.batch.id)).enrolledCount).toBe(1);
  });

  it("cancelling a batch cancels every open enrolment, releases seats and notifies learners", async () => {
    const { ctx, batch } = await institutionWithOpenBatch(3);
    const learners = await candidates(3);
    const rows = [];
    for (const l of learners) rows.push(await enrolmentService.applyToBatch(l, batch.id));
    await enrolmentService.confirmEnrolment(ctx, rows[0]!.id);
    const since = new Date(Date.now() - 1000);
    const cancelled = await batchService.cancelBatch(ctx, batch.id, "The workshop is closed for maintenance.");
    expect(cancelled).toMatchObject({ status: "cancelled", enrolledCount: 0, cancellationReason: "The workshop is closed for maintenance." });
    const after = await db.select().from(enrolments).where(eq(enrolments.batchId, batch.id));
    expect(after.every((e) => e.status === "cancelled" && e.statusReason === "The workshop is closed for maintenance.")).toBe(true);
    const tasks = await fx.tasksSince(since, "notifications.dispatch");
    const forBatch = tasks.filter((t) => t.payload.event === "training.enrolment_updated" && (t.payload.data as { batchCode?: string } | undefined)?.batchCode === batch.code);
    expect(forBatch).toHaveLength(3);
    await expect(enrolmentService.applyToBatch(learners[0]!, batch.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("sends published institution courses back to review when edited", async () => {
    const { ctx, course } = await institutionWithOpenBatch(5);
    const updated = await courseService.updateCourse(ctx, course.id, {
      title: course.title,
      summary: "Now with 3G vertical plates.",
      category: "welding",
      mode: "in_person",
      durationHours: 80,
      feeType: "free",
      certificationType: "completion_only",
      skillIds: [],
      outcomes: ["Weld 1G, 2G and 3G plate joints"],
      languageCodes: [],
    });
    expect(updated.status).toBe("pending_approval");
    const [open] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, course.id), eq(approvalRequests.status, "pending")));
    expect(open?.payload).toMatchObject({ summary: "Now with 3G vertical plates." });
  });
});
