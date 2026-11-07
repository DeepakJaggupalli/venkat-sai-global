/**
 * Broad smoke test of training management paths against PostgreSQL (isolated test database only):
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/training
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("training management", async () => {
  if (!enabled) return;
  const { eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { attendanceSessions, batches, courseModules, courses, placementOutcomes } = await import("@/db/schema");
  const fx = await import("@/modules/organizations/testing");
  const courseService = await import("./courses");
  const batchService = await import("./batches");
  const enrolmentService = await import("./enrolments");
  const attendance = await import("./attendance");
  const grading = await import("./grading");
  const certService = await import("./certificates");
  const centres = await import("./centres");
  const assessments = await import("./skill-assessments");
  const campus = await import("./campus");
  const internships = await import("./internships");
  const outcomes = await import("./outcomes");
  const queries = await import("./queries");
  const { getCandidateActor } = await import("./candidate");

  const page = { page: 1, pageSize: 50, offset: 0 };
  let staff: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    staff = fx.staffContext(await fx.createUser({ isStaff: true, displayName: "Workshop Lead" }), [
      "training.view",
      "training.manage",
      "training.certificates",
      "recruitment.assessments",
      "recruitment.view",
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function learner(name = "Learner") {
    const { user } = await fx.createCandidate(await fx.createUser({ displayName: name }));
    return (await getCandidateActor(user.id))!;
  }

  it("manages Venkat Sai courses, modules and batches end to end", async () => {
    const tag = randomUUID().slice(0, 6);
    const course = await courseService.createCourse(staff, {
      title: `Welding inspector prep ${tag}`,
      summary: "Visual inspection basics.",
      category: "welding",
      mode: "hybrid",
      durationHours: 24,
      feeType: "on_request",
      certificationType: "completion_only",
      skillIds: [],
      outcomes: [],
      languageCodes: [],
    });
    expect(course.organizationId).toBeNull();
    await expect(courseService.submitCourseForPublication(staff, course.id)).rejects.toMatchObject({ code: "validation" }); // no modules yet
    const m1 = await courseService.addCourseModule(staff, course.id, { title: "Defects", materialFileIds: [] });
    const m2 = await courseService.addCourseModule(staff, course.id, { title: "Codes", materialFileIds: [], durationHours: 2.5 });
    await courseService.updateCourseModule(staff, m1.id, { title: "Weld defects", description: "Porosity, undercut", materialFileIds: [] });
    await courseService.reorderCourseModules(staff, course.id, [m2.id, m1.id]);
    await expect(courseService.reorderCourseModules(staff, course.id, [m2.id])).rejects.toMatchObject({ code: "validation" });
    const ordered = await courseService.listCourseModules(course.id);
    expect(ordered.map((m) => m.title)).toEqual(["Codes", "Weld defects"]);
    expect((await courseService.submitCourseForPublication(staff, course.id)).status).toBe("published");
    await courseService.setCourseFeatured(staff, course.id, true);
    expect((await queries.getCourseForActor(staff, course.id)).modules).toHaveLength(2);
    expect((await queries.listCourses(staff, { organizationId: "venkat_sai", q: tag }, page)).items[0]).toMatchObject({ id: course.id, batchCount: 0 });

    const batch = await batchService.createBatch(staff, course.id, { title: "Weekend", mode: "hybrid", capacity: 2 });
    await batchService.openBatch(staff, batch.id);
    await batchService.pauseBatchEnrolment(staff, batch.id);
    await batchService.openBatch(staff, batch.id);
    const instructor = await batchService.addBatchInstructor(staff, batch.id, { userId: staff.user.id, role: "lead" });
    await batchService.updateBatchInstructor(staff, instructor.id, { userId: staff.user.id, name: "Workshop Lead", role: "assistant" });
    await batchService.addBatchInstructor(staff, batch.id, { name: "Guest welding engineer", role: "guest" });
    expect(await batchService.listBatchInstructors(batch.id)).toHaveLength(2);
    await batchService.removeBatchInstructor(staff, instructor.id);

    const a = await learner("Kiran");
    const b = await learner("Meena");
    await enrolmentService.enrolCandidateByStaff(staff, batch.id, a.candidateId);
    const eb = await enrolmentService.applyToBatch(b, batch.id);
    expect(eb.feeStatus).toBe("pending"); // fee on request
    await enrolmentService.confirmEnrolment(staff, eb.id);
    await expect(batchService.updateBatch(staff, batch.id, { title: "Weekend", mode: "hybrid", capacity: 1 })).rejects.toMatchObject({ code: "validation" });
    await batchService.updateBatch(staff, batch.id, { title: "Weekend", mode: "hybrid", capacity: 3 });
    expect((await db.select().from(batches).where(eq(batches.id, batch.id)))[0]).toMatchObject({ status: "open", enrolledCount: 2 });

    const detail = await queries.getBatchForActor(staff, batch.id);
    expect(detail.enrolmentCounts.confirmed).toBe(2);
    await batchService.startBatch(staff, batch.id);
    const session = await attendance.createAttendanceSession(staff, batch.id, { sessionDate: "2027-05-01", courseModuleId: m2.id });
    await attendance.updateAttendanceSession(staff, session.id, { sessionDate: "2027-05-02", topic: "Codes and standards" });
    const roster = await queries.listBatchEnrolments(staff, batch.id);
    await attendance.recordAttendance(staff, session.id, roster.map((r) => ({ enrolmentId: r.id, status: "present" as const })));
    expect((await attendance.getAttendanceRegister(staff, batch.id)).records).toHaveLength(2);
    await attendance.deleteAttendanceSession(staff, session.id);
    expect(await db.select().from(attendanceSessions).where(eq(attendanceSessions.batchId, batch.id))).toHaveLength(0);

    const quiz = await grading.createCourseAssessment(staff, batch.id, { title: "Quiz", type: "theory", maxScore: 20 });
    await grading.updateCourseAssessment(staff, quiz.id, { title: "Quiz 1", type: "theory", maxScore: 25, passScore: 10 });
    expect((await grading.getBatchGradebook(staff, batch.id)).assessments[0]).toMatchObject({ title: "Quiz 1", maxScore: 25 });
    await grading.deleteCourseAssessment(staff, quiz.id);
    for (const r of roster) await enrolmentService.completeEnrolment(staff, r.id);
    await grading.setEnrolmentResult(staff, roster[0]!.id, { resultStatus: "not_applicable" });
    await batchService.completeBatch(staff, batch.id);

    const cert = await certService.issueCertificate(staff, { issuerType: "venkat_sai", enrolmentId: roster[0]!.id, title: "Welding inspection preparation" });
    const corrected = await certService.reissueCertificate(staff, cert.id, { reason: "Spelling of the title", title: "Welding Inspection Preparation" });
    expect(corrected).toMatchObject({ replacesCertificateId: cert.id, title: "Welding Inspection Preparation", status: "active" });
    expect((await certService.listCertificates(staff, { status: "revoked" }, page)).items.map((c) => c.id)).toContain(cert.id);
    const holder = roster[0]!.candidateName === "Kiran" ? a : b;
    const codes = (await certService.listCandidateCertificates(holder)).map((c) => c.verificationCodeDisplay);
    expect(codes).toHaveLength(2);
    expect(codes.every((code) => /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code))).toBe(true);

    // Archive / restore / delete rules.
    await courseService.archiveCourse(staff, course.id);
    expect((await db.select().from(courses).where(eq(courses.id, course.id)))[0]).toMatchObject({ status: "archived", isFeatured: false });
    await courseService.restoreCourse(staff, course.id);
    await expect(courseService.deleteCourse(staff, course.id)).rejects.toMatchObject({ code: "conflict" });
    const empty = await courseService.createCourse(staff, { title: `Empty ${tag}`, category: "safety", mode: "online", feeType: "free", certificationType: "none", skillIds: [], outcomes: [], languageCodes: [] });
    await courseService.removeCourseModule(staff, (await courseService.addCourseModule(staff, empty.id, { title: "x", materialFileIds: [] })).id);
    expect(await db.select().from(courseModules).where(eq(courseModules.courseId, empty.id))).toHaveLength(0);
    await courseService.deleteCourse(staff, empty.id);
    expect((await db.select().from(courses).where(eq(courses.id, empty.id)))[0]!.deletedAt).toBeInstanceOf(Date);
    expect(await queries.getTrainingOverview(staff)).toMatchObject({ publishedCourses: expect.any(Number) });
  });

  it("assessment centres and the skill assessment lifecycle", async () => {
    const centre = await centres.createAssessmentCentre(staff, { name: `Test bay ${randomUUID().slice(0, 4)}`, countryCode: "IN", city: "Visakhapatnam", capabilities: ["FCAW"], timezone: "Asia/Kolkata" });
    await centres.updateAssessmentCentre(staff, centre.id, { name: centre.name, countryCode: "IN", city: "Visakhapatnam", capabilities: ["FCAW", "SMAW"], candidateInstructions: "Bring safety boots." });
    expect((await centres.listPublicAssessmentCentres()).find((c) => c.id === centre.id)).toMatchObject({ capabilities: ["FCAW", "SMAW"] });
    const candidate = await learner("Arjun");
    const scheduled = await assessments.scheduleSkillAssessment(staff, {
      candidateId: candidate.candidateId,
      assessmentCentreId: centre.id,
      trade: "Structural welder",
      assessmentType: "practical",
      evaluationMethods: [],
      scheduledAt: new Date(Date.now() + 86_400_000),
    });
    const moved = await assessments.rescheduleSkillAssessment(staff, { assessmentId: scheduled.id, scheduledAt: new Date(Date.now() + 3 * 86_400_000), location: "Client yard, Gajuwaka" });
    expect(moved).toMatchObject({ assessmentCentreId: null, location: "Client yard, Gajuwaka" });
    await assessments.cancelSkillAssessment(staff, { assessmentId: scheduled.id, reason: "Client postponed the test." });
    await expect(assessments.markSkillAssessmentNoShow(staff, scheduled.id)).rejects.toMatchObject({ code: "invalid_state" });
    const second = await assessments.scheduleSkillAssessment(staff, { candidateId: candidate.candidateId, assessmentCentreId: centre.id, trade: "Structural welder", assessmentType: "practical", evaluationMethods: [], scheduledAt: new Date(Date.now() + 86_400_000) });
    await assessments.markSkillAssessmentNoShow(staff, second.id);
    const third = await assessments.scheduleSkillAssessment(staff, { candidateId: candidate.candidateId, assessmentCentreId: centre.id, trade: "Structural welder", assessmentType: "practical", evaluationMethods: [], scheduledAt: new Date(Date.now() + 86_400_000), maxScore: 50 });
    await expect(assessments.recordSkillAssessmentResult(staff, { assessmentId: third.id, result: "pass", score: 60, evidenceFileIds: [], publish: false, verifySkill: false, issueCertificate: false })).rejects.toMatchObject({ code: "validation" });
    await assessments.recordSkillAssessmentResult(staff, { assessmentId: third.id, result: "pass", score: 41, evidenceFileIds: [], publish: false, verifySkill: false, issueCertificate: false });
    expect((await assessments.listCandidateSkillAssessments(candidate)).find((x) => x.id === third.id)).toMatchObject({ result: null });
    await assessments.publishSkillAssessmentResult(staff, third.id);
    expect((await assessments.listCandidateSkillAssessments(candidate)).find((x) => x.id === third.id)).toMatchObject({ result: "pass", score: 41 });
    expect((await assessments.listSkillAssessments(staff, { candidateId: candidate.candidateId }, page)).total).toBe(3);
    expect(await assessments.getSkillAssessment(staff, third.id)).toMatchObject({ candidateName: "Arjun", centreName: centre.name });
    await expect(centres.deleteAssessmentCentre(staff, centre.id)).rejects.toMatchObject({ code: "conflict" });
    await centres.setAssessmentCentreActive(staff, centre.id, false);
    expect((await centres.listAssessmentCentres(staff)).find((c) => c.id === centre.id)).toBeUndefined();
    const unused = await centres.createAssessmentCentre(staff, { name: `Unused ${randomUUID().slice(0, 4)}`, countryCode: "AE", city: "Sharjah", capabilities: [] });
    await centres.deleteAssessmentCentre(staff, unused.id);
  });

  it("Venkat Sai drives, internships and verified outcomes", async () => {
    const drive = await campus.createCampusDrive(staff, { title: "Gulf welders recruitment day", mode: "in_person", jobIds: [], isPublic: false });
    await campus.updateCampusDrive(staff, drive.id, { title: "Gulf welders recruitment day", mode: "in_person", jobIds: [], isPublic: false, employerName: "Confidential client" });
    await campus.setCampusDriveStatus(staff, drive.id, "open");
    const candidate = await learner("Farhan");
    await expect(campus.registerForCampusDrive(candidate, drive.id, { consentToShare: false })).rejects.toMatchObject({ code: "validation" });
    const registration = await campus.registerForCampusDrive(candidate, drive.id, { consentToShare: true });
    expect(registration.consentToShareAt).toBeInstanceOf(Date);
    await campus.updateCampusRegistrationStatus(staff, registration.id, "selected");
    await expect(campus.withdrawCampusDriveRegistration(candidate, registration.id)).rejects.toMatchObject({ code: "invalid_state" });
    expect((await campus.listCandidateCampusRegistrations(candidate))[0]).toMatchObject({ status: "selected", drive: { id: drive.id } });
    await expect(campus.setCampusDriveStatus(staff, drive.id, "cancelled")).rejects.toMatchObject({ code: "validation" });
    await campus.setCampusDriveStatus(staff, drive.id, "completed");

    const programme = await internships.createInternship(staff, { title: "Workshop apprenticeship", stipendType: "unpaid" });
    await internships.updateInternship(staff, programme.id, { title: "Workshop apprenticeship", stipendType: "not_disclosed", seats: 4 });
    await internships.setInternshipStatus(staff, programme.id, "open");
    await expect(internships.setInternshipStatus(staff, programme.id, "completed")).rejects.toMatchObject({ code: "invalid_state" });
    expect((await internships.listInternships(staff, { status: "open" }, page)).items.map((p) => p.id)).toContain(programme.id);

    const evidence = await fx.createFileRow({ purpose: "candidate_document", ownerUserId: staff.user.id });
    const outcome = await outcomes.recordPlacementOutcome(staff, { candidateId: candidate.candidateId, campusDriveId: drive.id, sourceType: "venkat_sai", employerName: "Confidential client", jobTitle: "Welder", placedOn: "2027-01-15" });
    await outcomes.updatePlacementOutcome(staff, outcome.id, { candidateId: candidate.candidateId, campusDriveId: drive.id, sourceType: "venkat_sai", employerName: "Confidential client", jobTitle: "TIG welder", placedOn: "2027-01-15", evidenceFileId: evidence });
    await outcomes.verifyPlacementOutcome(staff, outcome.id, true);
    await expect(outcomes.deletePlacementOutcome(staff, outcome.id)).rejects.toMatchObject({ code: "invalid_state" });
    await outcomes.confirmPlacementOutcome(candidate, outcome.id);
    const mine = await outcomes.listCandidatePlacementOutcomes(candidate);
    expect(mine[0]).toMatchObject({ jobTitle: "TIG welder", verified: true, reportedBy: "Venkat Sai" });
    expect(mine[0]).not.toHaveProperty("notes");
    expect((await outcomes.listPlacementOutcomes(staff, { verified: true }, page)).items.map((o) => o.id)).toContain(outcome.id);
    const [stored] = await db.select().from(placementOutcomes).where(eq(placementOutcomes.id, outcome.id));
    expect(stored!.candidateConfirmedAt).toBeInstanceOf(Date);
  });
});
