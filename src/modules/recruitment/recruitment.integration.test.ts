/**
 * Integration tests for the recruitment services against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_recruitment
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_recruitment'; npx vitest run src/modules/recruitment
 * Skipped unless DATABASE_URL points at a vsg_test_* database.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("recruitment services (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { and, eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { EMPLOYER_PERMISSIONS, PARTNER_PERMISSIONS, PLATFORM_PERMISSIONS } = await import("@/config/permissions");
  const { seedDefaultWorkflow } = await import("./seed");
  const svc = await import("./service");
  const q = await import("./queries");

  type SessionUser = import("@/modules/identity/session").SessionUser;
  type StaffContext = import("@/modules/identity/authz").StaffContext;
  type OrgContext<T extends "employer" | "recruitment_partner"> = import("@/modules/identity/authz").OrgContext<T>;
  type CandidateActor = import("./types").CandidateActor;

  const run = randomUUID().slice(0, 8);
  // Identity data unique per run, so repeated runs on the same database never match earlier fixtures.
  const runNumber = Number.parseInt(run.slice(0, 6), 16);
  const arjunPhone = `+919${String(runNumber % 1_000_000_000).padStart(9, "0")}`;
  const arjunDob = `${1960 + (runNumber % 40)}-${String(1 + (runNumber % 12)).padStart(2, "0")}-${String(1 + (runNumber % 28)).padStart(2, "0")}`;
  const passportStem = String(runNumber % 1000).padStart(3, "0");
  const page = { page: 1, pageSize: 50, offset: 0 };
  const DAY = 24 * 60 * 60 * 1000;

  // ---------------------------------------------------------------- fixtures
  await db.insert(s.currencies).values([
    { code: "INR", name: "Indian rupee", symbol: "₹", minorUnits: 2 },
    { code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 },
  ]).onConflictDoNothing();
  await db.insert(s.countries).values([
    { code: "IN", name: "India" },
    { code: "AE", name: "United Arab Emirates" },
  ]).onConflictDoNothing();
  await seedDefaultWorkflow();

  async function makeUser(name: string, opts: { isStaff?: boolean } = {}): Promise<SessionUser> {
    const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${run}@vsg-test.invalid`;
    const [row] = await db.insert(s.users).values({ displayName: name, email, isStaff: opts.isStaff ?? false, status: "active" }).returning();
    return {
      id: row!.id,
      email: row!.email,
      phone: row!.phone,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      displayName: row!.displayName,
      avatarFileId: null,
      status: "active",
      isStaff: row!.isStaff,
      locale: "en",
      timezone: null,
      hasPassword: false,
      twoFactorEnabled: true,
    };
  }

  async function makeOrg(type: "employer" | "recruitment_partner", name: string, status: "verified" | "pending" = "verified") {
    const [org] = await db.insert(s.organizations).values({ type, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${run}`, status }).returning();
    return org!;
  }

  function orgContext<T extends "employer" | "recruitment_partner">(orgType: T, user: SessionUser, organization: typeof s.organizations.$inferSelect): OrgContext<T> {
    const permissions = new Set<string>((orgType === "employer" ? EMPLOYER_PERMISSIONS : PARTNER_PERMISSIONS).map((p) => p.key));
    return {
      orgType,
      user,
      sessionId: `session-${user.id}`,
      organization,
      membership: { id: randomUUID(), status: "active", jobTitle: null, department: null },
      role: { id: randomUUID(), key: "owner", name: "Owner" },
      permissions,
      isOwner: true,
    };
  }

  async function makeCandidate(name: string, profile: Partial<typeof s.candidateProfiles.$inferInsert> = {}): Promise<CandidateActor & { user: SessionUser }> {
    const user = await makeUser(name);
    const [row] = await db.insert(s.candidateProfiles).values({ userId: user.id, headline: `${name} — welder`, currentJobTitle: "TIG welder", totalExperienceMonths: 60, ...profile }).returning({ id: s.candidateProfiles.id });
    return { kind: "candidate", userId: user.id, candidateId: row!.id, user };
  }

  async function makeFile(ownerUserId: string, purpose: (typeof s.files.$inferInsert)["purpose"], organizationId: string | null = null) {
    const id = randomUUID();
    await db.insert(s.files).values({
      id,
      storageDriver: "local",
      storageKey: `2026/11/${id}`,
      originalName: `${purpose}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: "a".repeat(64),
      purpose,
      ownerUserId,
      organizationId,
      scanStatus: "clean",
    });
    return id;
  }

  async function makeJob(values: Partial<typeof s.jobs.$inferInsert> & { title: string }) {
    const [job] = await db
      .insert(s.jobs)
      .values({ code: `VSG-JOB-T${randomUUID().slice(0, 8)}`, slug: `${values.title.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}`, status: "published", publishedAt: new Date(), countryCode: "IN", ...values })
      .returning();
    return job!;
  }

  /** A candidate-profile file grant like the ones the candidate viewer creates for an organisation. */
  async function grantProfileFile(candidateId: string, fileId: string, organizationId: string) {
    const [grant] = await db
      .insert(s.fileAccessGrants)
      .values({ fileId, granteeOrganizationId: organizationId, reason: "test profile grant", contextType: "candidate_profile", contextId: candidateId })
      .returning({ id: s.fileAccessGrants.id });
    return grant!.id;
  }

  async function grantRevokedAt(grantId: string) {
    const [row] = await db.select({ revokedAt: s.fileAccessGrants.revokedAt }).from(s.fileAccessGrants).where(eq(s.fileAccessGrants.id, grantId));
    return row!.revokedAt;
  }

  async function queuedNotifications(event: string) {
    const rows = await db.execute<{ type: string; payload: Record<string, unknown>; dedupe_key: string | null }>(
      sql`select type, payload, dedupe_key from background_jobs where type like 'notifications.%' and payload->>'event' = ${event}`,
    );
    return rows.rows;
  }

  const staffUser = await makeUser("Staff Member", { isStaff: true });
  const staffCtx: StaffContext = { user: staffUser, roleKeys: ["super_admin"], permissions: new Set(PLATFORM_PERMISSIONS.map((p) => p.key)), isSuperAdmin: true };
  const staff = svc.asStaff(staffCtx);
  const limitedStaff = svc.asStaff({ user: await makeUser("Analyst", { isStaff: true }), roleKeys: ["analyst"], permissions: new Set(["recruitment.view"]), isSuperAdmin: false });

  const employerOrg = await makeOrg("employer", "Gulf Fabrication Test");
  const otherEmployerOrg = await makeOrg("employer", "Other Employer Test");
  const employerUser = await makeUser("Employer HR");
  const employerCtx = orgContext("employer", employerUser, employerOrg);
  const employer = svc.asEmployer(employerCtx);
  const otherEmployer = svc.asEmployer(orgContext("employer", await makeUser("Other HR"), otherEmployerOrg));

  const partnerOrg = await makeOrg("recruitment_partner", "First Partner Test");
  const partner2Org = await makeOrg("recruitment_partner", "Second Partner Test");
  const unverifiedPartnerOrg = await makeOrg("recruitment_partner", "Unverified Partner Test", "pending");
  const partnerCtx = orgContext("recruitment_partner", await makeUser("Partner Recruiter"), partnerOrg);
  const partner2Ctx = orgContext("recruitment_partner", await makeUser("Partner Two Recruiter"), partner2Org);

  const ravi = await makeCandidate("Ravi Kumar", { visibility: "public_to_employers" });
  const resumeId = await makeFile(ravi.userId, "resume");
  await db.update(s.candidateProfiles).set({ resumeFileId: resumeId }).where(eq(s.candidateProfiles.id, ravi.candidateId));
  const docFileId = await makeFile(ravi.userId, "candidate_document");
  await db.insert(s.candidateDocuments).values({ candidateId: ravi.candidateId, documentType: "experience_letter", fileId: docFileId, isShareableWithEmployers: true });
  const privateDocFileId = await makeFile(ravi.userId, "candidate_document");
  await db.insert(s.candidateDocuments).values({ candidateId: ravi.candidateId, documentType: "passport", fileId: privateDocFileId, isShareableWithEmployers: false });

  const sita = await makeCandidate("Sita Devi", { visibility: "public_to_employers", emigrationCheckStatus: "ecr" });
  const meera = await makeCandidate("Meera Nair", { visibility: "public_to_employers" });
  const hiddenCandidate = await makeCandidate("Hidden Person", { visibility: "hidden" });
  const assignedCandidate = await makeCandidate("Assigned Person", { visibility: "venkat_sai_only" });
  const blockingCandidate = await makeCandidate("Blocking Person", { visibility: "public_to_employers" });
  await db.insert(s.candidatePrivacySettings).values({ candidateId: blockingCandidate.candidateId, blockedOrganizationIds: [employerOrg.id] });

  const job = await makeJob({ title: "TIG Welder", organizationId: employerOrg.id });
  const [passportQuestion] = await db
    .insert(s.jobScreeningQuestions)
    .values([
      { jobId: job.id, question: "Do you hold a valid passport?", type: "yes_no", isRequired: true, knockoutAnswer: { kind: "equals", value: false }, sortOrder: 1 },
      { jobId: job.id, question: "Anything else?", type: "text", isRequired: false, sortOrder: 2 },
    ])
    .returning({ id: s.jobScreeningQuestions.id });
  const overseasJob = await makeJob({ title: "Pipe Welder Dubai", organizationId: employerOrg.id, countryCode: "AE", isOverseas: true });
  const managedJob = await makeJob({ title: "Managed Fitter", organizationId: employerOrg.id, managedByVenkatSai: true });
  const closedJob = await makeJob({ title: "Closed Job", organizationId: employerOrg.id, status: "closed" });
  const expiredJob = await makeJob({ title: "Expired Job", organizationId: employerOrg.id, applicationDeadline: new Date(Date.now() - DAY) });

  afterAll(async () => {
    await pool.end();
  });

  // ---------------------------------------------------------------- seed
  it("seeds the default workflow idempotently with 17 stages", async () => {
    const again = await seedDefaultWorkflow();
    expect(again).toMatchObject({ workflowCreated: false, stagesInserted: 0 });
    const stages = await db.select().from(s.workflowStages).where(eq(s.workflowStages.workflowId, again.workflowId));
    expect(stages).toHaveLength(17);
    const [workflow] = await db.select().from(s.applicationWorkflows).where(eq(s.applicationWorkflows.id, again.workflowId));
    expect(workflow).toMatchObject({ key: "standard", isDefault: true, organizationId: null });
  });

  // ---------------------------------------------------------------- applications
  let raviApplicationId = "";

  it("validates job state, screening answers and consent when a candidate applies", async () => {
    await expect(svc.createApplication(ravi, { jobId: closedJob.id, consentToShare: true })).rejects.toMatchObject({ code: "job_closed" });
    await expect(svc.createApplication(ravi, { jobId: expiredJob.id, consentToShare: true })).rejects.toMatchObject({ code: "job_expired" });
    await expect(svc.createApplication(ravi, { jobId: job.id, consentToShare: true })).rejects.toMatchObject({ code: "screening_incomplete" });
    await expect(svc.createApplication(ravi, { jobId: job.id, consentToShare: false as never, answers: { [passportQuestion!.id]: true } })).rejects.toThrow();
    await expect(svc.createApplication(ravi, { jobId: randomUUID(), consentToShare: true })).rejects.toMatchObject({ code: "not_found" });
  });

  it("creates an application with snapshot, consent, knockout flag, history, file grants and notifications", async () => {
    const created = await svc.createApplication(ravi, { jobId: job.id, consentToShare: true, coverLetter: "Hello", answers: { [passportQuestion!.id]: false } });
    raviApplicationId = created.id;
    expect(created).toMatchObject({ reopened: false, knockoutFlagCount: 1 });
    expect(created.code).toMatch(/^VSG-APP-\d{6}$/);

    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, created.id));
    expect(app).toMatchObject({ status: "active", source: "direct", resumeFileId: resumeId, coverLetter: "Hello" });
    expect(app!.sharedWithEmployerAt).toBeInstanceOf(Date);
    expect(app!.knockoutFlags).toHaveLength(1);
    expect(app!.profileSnapshot).toMatchObject({ version: 1, displayName: "Ravi Kumar", currentJobTitle: "TIG welder" });
    expect(JSON.stringify(app!.profileSnapshot)).not.toMatch(/passport_?number|dateOfBirth|gender/i);

    const [stage] = await db.select().from(s.workflowStages).where(eq(s.workflowStages.id, app!.currentStageId));
    expect(stage!.key).toBe("submitted");
    const [consent] = await db.select().from(s.consentRecords).where(eq(s.consentRecords.id, app!.consentRecordId!));
    expect(consent).toMatchObject({ userId: ravi.userId, purpose: "share_profile_with_employers", granted: true, contextType: "application", contextId: created.id });
    const history = await db.select().from(s.applicationStageHistory).where(eq(s.applicationStageHistory.applicationId, created.id));
    expect(history).toHaveLength(1);
    const answers = await db.select().from(s.applicationAnswers).where(eq(s.applicationAnswers.applicationId, created.id));
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ answer: false, isFlagged: true });
    const [jobRow] = await db.select({ applicationCount: s.jobs.applicationCount }).from(s.jobs).where(eq(s.jobs.id, job.id));
    expect(jobRow!.applicationCount).toBe(1);

    const grants = await db.select().from(s.fileAccessGrants).where(and(eq(s.fileAccessGrants.contextType, "application"), eq(s.fileAccessGrants.contextId, created.id)));
    expect(grants.map((g) => g.fileId).sort()).toEqual([resumeId, docFileId].sort());
    expect(grants.every((g) => g.granteeOrganizationId === employerOrg.id && g.revokedAt === null)).toBe(true);

    expect((await queuedNotifications("application.submitted")).some((n) => n.dedupe_key?.includes("application-submitted"))).toBe(true);
    expect((await queuedNotifications("application.received")).some((n) => n.type === "notifications.dispatch_org")).toBe(true);
  });

  it("refuses a duplicate application", async () => {
    await expect(svc.createApplication(ravi, { jobId: job.id, consentToShare: true, answers: { [passportQuestion!.id]: true } })).rejects.toMatchObject({ code: "duplicate_application" });
  });

  it("enforces the transition matrix with ownership checks", async () => {
    await expect(svc.transitionApplication(raviApplicationId, "shortlisted", ravi)).rejects.toMatchObject({ code: "target_not_allowed" });
    await expect(svc.transitionApplication(raviApplicationId, "shortlisted", otherEmployer)).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.transitionApplication(raviApplicationId, "shortlisted", svc.asPartner(partnerCtx))).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.transitionApplication(raviApplicationId, "shortlisted", limitedStaff)).rejects.toMatchObject({ code: "forbidden" });

    const moved = await svc.transitionApplication(raviApplicationId, "shortlisted", employer, { internalNote: "Strong CV", candidateVisibleNote: "Well done" });
    expect(moved).toMatchObject({ fromStageKey: "submitted", toStageKey: "shortlisted", status: "active" });
    const [last] = await db
      .select()
      .from(s.applicationStageHistory)
      .where(eq(s.applicationStageHistory.id, moved.historyId));
    expect(last).toMatchObject({ changedByType: "employer", changedByOrganizationId: employerOrg.id, note: "Strong CV", candidateVisibleNote: "Well done" });
    const status = await queuedNotifications("application.status_changed");
    const mine = status.find((n) => n.dedupe_key === `notify:application-stage:${moved.historyId}`);
    expect(mine?.payload).toMatchObject({ data: { status: "Shortlisted", message: "Well done" } });
    expect(JSON.stringify(mine?.payload)).not.toContain("Strong CV");

    await expect(svc.transitionApplication(raviApplicationId, "documentation", employer)).rejects.toMatchObject({ code: "target_not_allowed" });
    await expect(svc.transitionApplication(raviApplicationId, "rejected", employer)).rejects.toMatchObject({ fieldErrors: { rejectionReasonCode: expect.any(Array) } });
    await expect(svc.transitionApplication(raviApplicationId, "no_such_stage", staff)).rejects.toMatchObject({ code: "unknown_stage" });
  });

  it("lets staff reject and re-open, keeping status timestamps consistent", async () => {
    await svc.transitionApplication(raviApplicationId, "rejected", staff, { rejectionReasonCode: "skills_mismatch", rejectionReason: "Needs 6G" });
    let [app] = await db.select().from(s.applications).where(eq(s.applications.id, raviApplicationId));
    expect(app).toMatchObject({ status: "rejected", rejectionReasonCode: "skills_mismatch" });
    expect(app!.rejectedAt).toBeInstanceOf(Date);
    await expect(svc.transitionApplication(raviApplicationId, "shortlisted", employer)).rejects.toMatchObject({ code: "from_final" });

    await svc.transitionApplication(raviApplicationId, "shortlisted", staff, { internalNote: "Re-opened after review" });
    [app] = await db.select().from(s.applications).where(eq(s.applications.id, raviApplicationId));
    expect(app).toMatchObject({ status: "active", rejectedAt: null, rejectionReasonCode: null });
    const [reopened] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "application.reopened"), eq(s.auditLogs.entityId, raviApplicationId)));
    expect(reopened).toBeTruthy();
  });

  it("gives candidates only candidate-safe views", async () => {
    const list = await q.listApplicationsForCandidate(ravi, {}, page);
    expect(list.items.map((i) => i.id)).toContain(raviApplicationId);
    const detail = await q.getApplicationForCandidate(ravi, raviApplicationId);
    expect(detail.stage).toMatchObject({ key: "shortlisted", label: "Shortlisted" });
    expect(detail.stage.translations.hi?.label).toBeTruthy();
    expect(detail.history.map((h) => h.note)).toContain("Well done");
    const serialized = JSON.stringify(detail);
    for (const secret of ["Strong CV", "Needs 6G", "Re-opened after review", "knockoutFlags", "rating"]) expect(serialized).not.toContain(secret);
    await expect(q.getApplicationForCandidate(sita, raviApplicationId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("scopes internal notes by visibility", async () => {
    await svc.addApplicationNote(staff, { applicationId: raviApplicationId, body: "Staff only note", visibility: "staff_only" });
    await svc.addApplicationNote(staff, { applicationId: raviApplicationId, body: "Shared with employer", visibility: "staff_and_employer" });
    await svc.addApplicationNote(employer, { applicationId: raviApplicationId, body: "Employer note", visibility: "staff_only" });
    await expect(svc.addApplicationNote(staff, { applicationId: raviApplicationId, body: "x", visibility: "staff_and_partner" })).rejects.toMatchObject({ fieldErrors: { visibility: expect.any(Array) } });
    const staffNotes = await q.listApplicationNotes(staff, raviApplicationId);
    expect(staffNotes).toHaveLength(3);
    const employerNotes = await q.listApplicationNotes(employer, raviApplicationId);
    expect(employerNotes.map((n) => n.body).sort()).toEqual(["Employer note", "Shared with employer"]);
    expect(employerNotes.every((n) => n.visibility === "staff_and_employer")).toBe(true);
    expect(await q.listApplicationNotes(ravi, raviApplicationId)).toEqual([]);
  });

  it("builds the employer pipeline board grouped by PIPELINE_COLUMNS", async () => {
    const board = await q.getPipelineBoard(employer, job.id);
    expect(board.columns).toHaveLength(10);
    const shortlisted = board.columns.find((c) => c.key === "shortlisted")!;
    expect(shortlisted.count).toBe(1);
    expect(shortlisted.cards[0]).toMatchObject({ applicationId: raviApplicationId, displayName: "Ravi Kumar", nameMasked: false, knockoutFlagCount: 1, source: "direct" });
    await expect(q.getPipelineBoard(otherEmployer, job.id)).rejects.toMatchObject({ code: "not_found" });
    const overview = await q.getEmployerPipelineOverview(employerCtx);
    expect(overview.jobs.find((j) => j.id === job.id)?.counts.shortlisted).toBe(1);
    expect(overview.requirementColumns.map((c) => c.label)).toEqual(["New", "Approved", "Sourcing"]);
    const staffList = await q.listApplicationsForStaff(staffCtx, { jobId: job.id, stageKey: "shortlisted" }, page);
    expect(staffList.total).toBe(1);
  });

  it("withdraws (revoking file access and consent) and lets the candidate re-apply", async () => {
    const profileGrant = await grantProfileFile(ravi.candidateId, resumeId, employerOrg.id);
    await svc.withdrawApplication(ravi, raviApplicationId, { reason: "Accepted another job" });
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, raviApplicationId));
    expect(app).toMatchObject({ status: "withdrawn", withdrawalReason: "Accepted another job" });
    const grants = await db.select().from(s.fileAccessGrants).where(and(eq(s.fileAccessGrants.contextType, "application"), eq(s.fileAccessGrants.contextId, raviApplicationId)));
    expect(grants.every((g) => g.revokedAt !== null)).toBe(true);
    // The employer's candidate-profile grants go too (the viewer re-grants whatever another relationship allows).
    expect(await grantRevokedAt(profileGrant)).toBeInstanceOf(Date);
    const consents = await db.select().from(s.consentRecords).where(and(eq(s.consentRecords.contextId, raviApplicationId), eq(s.consentRecords.granted, false)));
    expect(consents).toHaveLength(1);
    await expect(svc.transitionApplication(raviApplicationId, "under_review", staff)).rejects.toMatchObject({ code: "withdrawn_is_final" });

    const again = await svc.createApplication(ravi, { jobId: job.id, consentToShare: true, answers: { [passportQuestion!.id]: true } });
    expect(again).toMatchObject({ id: raviApplicationId, reopened: true, knockoutFlagCount: 0 });
    const [reopened] = await db.select().from(s.applications).where(eq(s.applications.id, raviApplicationId));
    expect(reopened).toMatchObject({ status: "active", withdrawnAt: null });
    const [jobRow] = await db.select({ applicationCount: s.jobs.applicationCount }).from(s.jobs).where(eq(s.jobs.id, job.id));
    expect(jobRow!.applicationCount).toBe(1);
    const activeGrants = await db.select().from(s.fileAccessGrants).where(and(eq(s.fileAccessGrants.contextId, raviApplicationId), sql`${s.fileAccessGrants.revokedAt} is null`));
    expect(activeGrants).toHaveLength(2);
  });

  it("keeps Venkat Sai-managed applications from the employer until staff share them", async () => {
    const created = await svc.createApplication(sita, { jobId: managedJob.id, consentToShare: true });
    const before = await q.listApplicationsForJob(employer, managedJob.id, {}, page);
    expect(before.total).toBe(0);
    await expect(q.getApplicationForEmployer(employerCtx, created.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await queuedNotifications("application.received")).some((n) => n.type === "notifications.dispatch_staff")).toBe(true);

    const results = await svc.shareApplicationsWithEmployer(staffCtx, [created.id]);
    expect(results).toEqual([{ id: created.id, ok: true }]);
    const after = await q.listApplicationsForJob(employer, managedJob.id, {}, page);
    expect(after.total).toBe(1);
    const detail = await q.getApplicationForEmployer(employerCtx, created.id);
    expect(detail.application.source).toBe("direct");
    expect(detail.allowedTargets.map((st) => st.key)).toContain("shortlisted");
  });

  it("lets staff assign a candidate with recorded consent", async () => {
    const created = await svc.createApplication(staff, { jobId: overseasJob.id, candidateId: assignedCandidate.candidateId, consentConfirmed: true, consentMethod: "verbal", consentNote: "Phone call" });
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, created.id));
    expect(app).toMatchObject({ source: "staff_assigned", submittedByUserId: staffUser.id });
    const [consent] = await db.select().from(s.consentRecords).where(eq(s.consentRecords.id, app!.consentRecordId!));
    expect(consent).toMatchObject({ capturedByUserId: staffUser.id, source: "staff_assignment" });
    await expect(
      svc.createApplication(staff, { jobId: overseasJob.id, candidateId: blockingCandidate.candidateId, consentConfirmed: true, consentMethod: "verbal" }),
    ).rejects.toMatchObject({ code: "candidate_blocked_org" });
  });

  it("keeps minors out of overseas jobs and refuses jobs that are not live yet", async () => {
    const fifteenYearsAgo = new Date(Date.now() - 15 * 365.25 * DAY).toISOString().slice(0, 10);
    const minor = await makeCandidate("Young Learner", { dateOfBirth: fifteenYearsAgo });
    await expect(svc.createApplication(minor, { jobId: overseasJob.id, consentToShare: true })).rejects.toMatchObject({
      code: "minor_overseas",
      message: expect.stringContaining("18 or over"),
    });
    await expect(
      svc.createApplication(staff, { jobId: overseasJob.id, candidateId: minor.candidateId, consentConfirmed: true, consentMethod: "verbal" }),
    ).rejects.toMatchObject({ code: "minor_overseas" });
    // Without a date of birth, a guardian-consent record marks the account as a minor's.
    const guarded = await makeCandidate("Guarded Learner");
    await db.insert(s.consentRecords).values({ userId: guarded.userId, purpose: "guardian_consent", granted: true, source: "test" });
    await expect(svc.createApplication(guarded, { jobId: overseasJob.id, consentToShare: true })).rejects.toMatchObject({ code: "minor_overseas" });
    // A domestic job is fine.
    const domestic = await makeJob({ title: "Apprentice Welder", organizationId: employerOrg.id });
    await expect(svc.createApplication(minor, { jobId: domestic.id, consentToShare: true })).resolves.toMatchObject({ reopened: false });

    const scheduled = await makeJob({ title: "Scheduled Welder", organizationId: employerOrg.id, publishedAt: new Date(Date.now() + 2 * DAY) });
    await expect(svc.createApplication(ravi, { jobId: scheduled.id, consentToShare: true })).rejects.toMatchObject({ code: "job_closed" });
  });

  // ---------------------------------------------------------------- interviews
  it("schedules interviews in an explicit time zone and sends deduplicated reminders", async () => {
    await expect(
      svc.scheduleInterview(employer, { applicationId: raviApplicationId, roundName: "Client round", mode: "video", startsAtLocal: "2020-01-01T10:00", timezone: "Asia/Dubai", durationMinutes: 45 }),
    ).rejects.toMatchObject({ fieldErrors: { startsAtLocal: expect.any(Array) } });
    await expect(
      svc.scheduleInterview(employer, { applicationId: raviApplicationId, roundName: "Client round", mode: "video", startsAtLocal: "2030-01-01T10:00", timezone: "Nowhere/City", durationMinutes: 45 }),
    ).rejects.toMatchObject({ fieldErrors: { timezone: expect.any(Array) } });

    const startLocal = new Date(Date.now() + 23 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString().slice(0, 16); // UTC wall time ≈ 23 h ahead in Dubai (+4)
    const { id: interviewId, code } = await svc.scheduleInterview(employer, {
      applicationId: raviApplicationId,
      roundName: "Client round",
      mode: "video",
      startsAtLocal: startLocal,
      timezone: "Asia/Dubai",
      durationMinutes: 45,
      meetingUrl: "https://meet.example.com/abc",
      participants: [{ name: "External Panelist", email: "panel@example.com", role: "interviewer" }],
    });
    expect(code).toMatch(/^VSG-INT-/);
    const [interview] = await db.select().from(s.interviews).where(eq(s.interviews.id, interviewId));
    expect(interview).toMatchObject({ timezone: "Asia/Dubai", organizationId: employerOrg.id, status: "scheduled" });
    const [app] = await db.select({ stageKey: s.workflowStages.key }).from(s.applications).innerJoin(s.workflowStages, eq(s.workflowStages.id, s.applications.currentStageId)).where(eq(s.applications.id, raviApplicationId));
    expect(app!.stageKey).toBe("interview_scheduled");

    await svc.respondToInterview(ravi, { interviewId, response: "confirmed" });
    const [confirmed] = await db.select().from(s.interviews).where(eq(s.interviews.id, interviewId));
    expect(confirmed!.candidateResponse).toBe("confirmed");
    await expect(svc.respondToInterview(sita, { interviewId, response: "declined" })).rejects.toMatchObject({ code: "not_found" });

    const sent = await svc.sendDueInterviewReminders(new Date());
    expect(sent).toBeGreaterThanOrEqual(1);
    const countReminders = async () => (await queuedNotifications("interview.reminder")).filter((n) => n.dedupe_key?.includes(interviewId)).length;
    const first = await countReminders();
    expect(first).toBe(2); // candidate + panel
    await svc.sendDueInterviewReminders(new Date());
    expect(await countReminders()).toBe(first);

    const views = await q.listInterviewsForCandidate(ravi, { upcomingOnly: true });
    expect(views.find((v) => v.id === interviewId)).toMatchObject({ canRespond: true, meetingUrl: "https://meet.example.com/abc" });
    expect(JSON.stringify(views)).not.toContain("panel@example.com");
  });

  // ---------------------------------------------------------------- unlocks
  it("unlocks discoverable candidates once per 90 days and logs every reveal", async () => {
    const viaApplication = await svc.unlockCandidate(employerCtx, sita.candidateId);
    expect(viaApplication).toMatchObject({ entitledBy: "application", creditConsumed: false, unlockId: null });
    const result = await svc.unlockCandidate(employerCtx, meera.candidateId, { reason: "Matches welding role" });
    expect(result).toMatchObject({ entitledBy: "unlock", creditConsumed: true, contact: { email: meera.user.email } });
    const expiresIn = result.expiresAt!.getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(89 * DAY);
    expect(expiresIn).toBeLessThanOrEqual(90 * DAY);
    const again = await svc.unlockCandidate(employerCtx, meera.candidateId);
    expect(again).toMatchObject({ creditConsumed: false, unlockId: result.unlockId });
    const logs = await db.select().from(s.dataAccessLogs).where(and(eq(s.dataAccessLogs.subjectId, meera.candidateId), eq(s.dataAccessLogs.accessType, "reveal")));
    expect(logs.length).toBeGreaterThanOrEqual(2);
    await expect(svc.unlockCandidate(employerCtx, hiddenCandidate.candidateId)).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.unlockCandidate(employerCtx, blockingCandidate.candidateId)).rejects.toMatchObject({ code: "not_found" });
    const unverifiedCtx = orgContext("employer", employerUser, { ...employerOrg, status: "pending" });
    await expect(svc.unlockCandidate(unverifiedCtx, meera.candidateId)).rejects.toMatchObject({ code: "org_not_verified" });
    const candidateView = await q.listUnlocksForCandidate(meera);
    expect(candidateView[0]).toMatchObject({ organizationName: employerOrg.name, active: true });
  });

  it("charges a renewal of a lapsed unlock and withdraws profile grants when an unlock lapses or is revoked", async () => {
    const kiran = await makeCandidate("Kiran Rao", { visibility: "public_to_employers" });
    const kiranFile = await makeFile(kiran.userId, "resume");
    const first = await svc.unlockCandidate(employerCtx, kiran.candidateId);
    expect(first).toMatchObject({ entitledBy: "unlock", creditConsumed: true });

    // The unlock lapses: the hourly task withdraws the organisation's profile grants.
    await db
      .update(s.profileUnlocks)
      .set({ unlockedAt: new Date(Date.now() - 91 * DAY), expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(s.profileUnlocks.id, first.unlockId!));
    const lapsedGrant = await grantProfileFile(kiran.candidateId, kiranFile, employerOrg.id);
    expect(await svc.revokeGrantsForLapsedUnlocks(new Date())).toBeGreaterThanOrEqual(1);
    expect(await grantRevokedAt(lapsedGrant)).toBeInstanceOf(Date);

    // Renewing reuses the row but is a new charge (its own ledger reference).
    const renewed = await svc.unlockCandidate(employerCtx, kiran.candidateId);
    expect(renewed).toMatchObject({ creditConsumed: true, unlockId: first.unlockId });
    const ledger = await db
      .select({ referenceId: s.creditLedger.referenceId })
      .from(s.creditLedger)
      .where(and(eq(s.creditLedger.organizationId, employerOrg.id), eq(s.creditLedger.referenceType, "profile_unlock"), sql`${s.creditLedger.referenceId} like ${`${first.unlockId}%`}`));
    expect(ledger.map((r) => r.referenceId).sort()).toEqual([first.unlockId, `${first.unlockId}:${renewed.expiresAt!.toISOString()}`].sort());

    // Revoking the unlock (e.g. the candidate blocked the employer) withdraws the grants at once.
    const activeGrant = await grantProfileFile(kiran.candidateId, kiranFile, employerOrg.id);
    expect(await svc.revokeUnlocksForCandidate(kiran.candidateId, { organizationIds: [employerOrg.id], reason: "Candidate blocked the organisation" })).toBe(1);
    expect(await grantRevokedAt(activeGrant)).toBeInstanceOf(Date);
  });

  it("manages talent lists with privacy-aware cards", async () => {
    const { id: listId } = await svc.createTalentList(employer, { name: "Dubai welders", kind: "shortlist", isShared: true });
    const results = await svc.addCandidatesToList(employer, { listId, candidateIds: [meera.candidateId, ravi.candidateId, hiddenCandidate.candidateId] });
    expect(results.filter((r) => r.ok).map((r) => r.id).sort()).toEqual([ravi.candidateId, meera.candidateId].sort());
    const list = await q.getTalentList(employer, listId);
    expect(list.items).toHaveLength(2);
    const meeraCard = list.items.find((i) => i.candidate.candidateId === meera.candidateId)!.candidate;
    expect(meeraCard).toMatchObject({ nameMasked: false, relation: { hasActiveUnlock: true } });
    expect(JSON.stringify(list)).not.toMatch(/@vsg-test\.invalid/);
    const compare = await q.getTalentListCompareData(employer, { listId, candidateIds: [meera.candidateId, ravi.candidateId] });
    expect(compare).toHaveLength(2);
    await expect(q.getTalentList(otherEmployer, listId)).rejects.toMatchObject({ code: "not_found" });
  });

  // ---------------------------------------------------------------- partners
  let partnerSubmissionId = "";
  let partnerCandidateId = "";
  let partner2AssignmentId = "";

  it("assigns work only to verified partners and warns about overseas licences", async () => {
    await expect(svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: unverifiedPartnerOrg.id, jobId: job.id })).rejects.toMatchObject({ code: "partner_not_verified" });
    const domestic = await svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: partnerOrg.id, jobId: job.id, submissionLimit: 5, positionsTarget: 3 });
    expect(domestic.warnings).toEqual([]);
    await expect(svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: partnerOrg.id, jobId: job.id })).rejects.toMatchObject({ code: "assignment_open" });
    const overseas = await svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: partner2Org.id, jobId: overseasJob.id });
    expect(overseas.warnings).toEqual(["partner_without_verified_recruiting_agent_licence"]);
    const second = await svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: partner2Org.id, jobId: job.id });
    partner2AssignmentId = second.id;
    expect((await queuedNotifications("partner.assignment_created")).length).toBeGreaterThanOrEqual(3);

    const assignments = await q.listAssignmentsForPartner(partnerCtx, {}, page);
    expect(assignments.items.map((a) => a.id)).toEqual([domestic.id]);
    expect(JSON.stringify(assignments)).not.toContain("internalNotes");
  });

  it("creates an unclaimed profile for a new person, records consent and wins attribution", async () => {
    const [assignment] = await db.select().from(s.partnerAssignments).where(and(eq(s.partnerAssignments.partnerOrganizationId, partnerOrg.id), eq(s.partnerAssignments.jobId, job.id)));
    const email = `arjun.${run}@vsg-test.invalid`;
    const result = await svc.submitCandidateByPartner(partnerCtx, assignment!.id, {
      candidate: { kind: "new", fullName: "Arjun Rao", email, phone: arjunPhone, dateOfBirth: arjunDob, passportNumber: `Z${passportStem}4567`, currentCountryCode: "IN" },
      consent: { attested: true, method: "written" },
      partnerNotes: "Experienced pipe welder",
    });
    partnerSubmissionId = result.submissionId;
    partnerCandidateId = result.candidateId;
    expect(result).toMatchObject({ status: "submitted", candidateCreated: true, attribution: "attribute" });
    expect(result.code).toMatch(/^VSG-SUB-/);

    const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
    expect(user).toMatchObject({ status: "pending_verification", passwordHash: null });
    const [profile] = await db.select().from(s.candidateProfiles).where(eq(s.candidateProfiles.id, result.candidateId));
    expect(profile).toMatchObject({ source: "partner", sourcedByPartnerOrgId: partnerOrg.id, passportNumberLast4: "4567", visibility: "venkat_sai_only" });
    expect(profile!.passportNumberEncrypted).not.toContain(`Z${passportStem}4567`);
    const [submission] = await db.select().from(s.partnerSubmissions).where(eq(s.partnerSubmissions.id, result.submissionId));
    const [consent] = await db.select().from(s.consentRecords).where(eq(s.consentRecords.id, submission!.consentRecordId!));
    expect(consent).toMatchObject({ purpose: "partner_submission", capturedByUserId: partnerCtx.user.id, userId: user!.id });
    const [attribution] = await db.select().from(s.candidateAttributions).where(eq(s.candidateAttributions.candidateId, result.candidateId));
    expect(attribution).toMatchObject({ partnerOrganizationId: partnerOrg.id, status: "active", firstSubmissionId: result.submissionId });
    const windowDays = (attribution!.expiresAt!.getTime() - attribution!.firstSubmittedAt.getTime()) / DAY;
    expect(Math.round(windowDays)).toBe(90);
    const notice = (await queuedNotifications("candidate.partner_submission_notice")).find((n) => n.dedupe_key?.includes(result.submissionId));
    expect(JSON.stringify(notice?.payload.recipients)).toContain(email);
    expect(notice?.payload.link).toBe("/sign-up?intent=candidate");

    await expect(
      svc.submitCandidateByPartner(partnerCtx, assignment!.id, { candidate: { kind: "existing", candidateId: result.candidateId }, consent: { attested: true, method: "written" } }),
    ).rejects.toMatchObject({ code: "duplicate_submission" });
    await expect(
      svc.submitCandidateByPartner(partnerCtx, assignment!.id, { candidate: { kind: "existing", candidateId: sita.candidateId }, consent: { attested: true, method: "written" } }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("marks submissions of a candidate attributed to another partner as duplicates and flags possible duplicates", async () => {
    const sameEmail = await svc.submitCandidateByPartner(partner2Ctx, partner2AssignmentId, {
      candidate: { kind: "new", fullName: "Arjun Rao", email: `arjun.${run}@vsg-test.invalid` },
      consent: { attested: true, method: "verbal" },
    });
    expect(sameEmail).toMatchObject({ status: "duplicate", candidateId: partnerCandidateId, candidateCreated: false, attribution: "duplicate" });
    const [dup] = await db.select().from(s.partnerSubmissions).where(eq(s.partnerSubmissions.id, sameEmail.submissionId));
    expect(dup!.duplicateOfCandidateId).toBe(partnerCandidateId);

    // A different email, but the same passport last 4 + date of birth and name.
    const lookalike = await svc.submitCandidateByPartner(partner2Ctx, (await svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: partner2Org.id, jobId: managedJob.id })).id, {
      candidate: { kind: "new", fullName: "Rao Arjun", email: `arjun.other.${run}@vsg-test.invalid`, dateOfBirth: arjunDob, passportNumber: `Y${passportStem}4567` },
      consent: { attested: true, method: "verbal" },
    });
    expect(lookalike).toMatchObject({ status: "duplicate", candidateCreated: true });
    const flags = await db.select().from(s.duplicateFlags).where(eq(s.duplicateFlags.candidateId, lookalike.candidateId));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ possibleDuplicateCandidateId: partnerCandidateId, source: "partner_submission", status: "open" });
    expect([...flags[0]!.matchedOn].sort()).toEqual(["name_dob", "passport_last4"]);
    expect(flags[0]!.score).toBe(85);

    const queue = await q.listSubmissionsForStaff(staffCtx, { queue: true }, page);
    const item = queue.items.find((i) => i.id === sameEmail.submissionId);
    expect(item).toMatchObject({ status: "duplicate", activeAttribution: { partnerOrganizationId: partnerOrg.id } });
    const partner2View = await q.listSubmissionsForPartner(partner2Ctx, {}, page);
    expect(partner2View.items.every((i) => i.id !== partnerSubmissionId)).toBe(true);
  });

  it("applies the configured attribution window and lets a new partner win after it ends", async () => {
    await db.insert(s.platformSettings).values({ key: "recruitment.partner_attribution_days", value: 30 }).onConflictDoUpdate({ target: s.platformSettings.key, set: { value: 30 } });
    expect(await svc.getAttributionWindowDays()).toBe(30);
    // The first partner's window ends.
    await db.update(s.candidateAttributions).set({ firstSubmittedAt: new Date(Date.now() - 100 * DAY), expiresAt: new Date(Date.now() - DAY) }).where(eq(s.candidateAttributions.candidateId, partnerCandidateId));
    const assignment = await svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: partner2Org.id, jobId: closedJob.id }).catch(() => null);
    expect(assignment).toBeNull(); // closed jobs cannot be assigned
    const extraJob = await makeJob({ title: "Extra Welder", organizationId: employerOrg.id });
    const extra = await svc.createPartnerAssignment(staffCtx, { partnerOrganizationId: partner2Org.id, jobId: extraJob.id });
    const result = await svc.submitCandidateByPartner(partner2Ctx, extra.id, { candidate: { kind: "existing", candidateId: partnerCandidateId }, consent: { attested: true, method: "electronic" } });
    expect(result).toMatchObject({ status: "submitted", attribution: "attribute" });
    const attributions = await db.select().from(s.candidateAttributions).where(eq(s.candidateAttributions.candidateId, partnerCandidateId));
    expect(attributions.find((a) => a.partnerOrganizationId === partnerOrg.id)?.status).toBe("expired");
    const won = attributions.find((a) => a.partnerOrganizationId === partner2Org.id && a.status === "active")!;
    expect(Math.round((won.expiresAt!.getTime() - won.firstSubmittedAt.getTime()) / DAY)).toBe(30);
    await db.delete(s.platformSettings).where(eq(s.platformSettings.key, "recruitment.partner_attribution_days"));
  });

  it("accepts a submission into an application credited to the partner; duplicates must be resolved first", async () => {
    const duplicates = await db.select().from(s.partnerSubmissions).where(and(eq(s.partnerSubmissions.partnerOrganizationId, partner2Org.id), eq(s.partnerSubmissions.status, "duplicate")));
    await expect(svc.acceptPartnerSubmission(staffCtx, { submissionId: duplicates[0]!.id })).rejects.toMatchObject({ code: "submission_duplicate" });

    await svc.startSubmissionReview(staffCtx, partnerSubmissionId);
    const accepted = await svc.acceptPartnerSubmission(staffCtx, { submissionId: partnerSubmissionId, partnerFeedback: "Good profile", reviewNotes: "Checked documents" });
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, accepted.applicationId));
    expect(app).toMatchObject({ source: "partner", partnerOrganizationId: partnerOrg.id, candidateId: partnerCandidateId, submittedByUserId: partnerCtx.user.id });
    const [submission] = await db.select().from(s.partnerSubmissions).where(eq(s.partnerSubmissions.id, partnerSubmissionId));
    expect(submission).toMatchObject({ status: "accepted", applicationId: accepted.applicationId, reviewedByUserId: staffUser.id });
    expect((await queuedNotifications("partner.submission_status_changed")).some((n) => n.dedupe_key?.includes(`${partnerSubmissionId}:accepted`))).toBe(true);

    const view = await q.getSubmissionForPartner(partnerCtx, partnerSubmissionId);
    expect(view.application).toMatchObject({ id: accepted.applicationId, status: "active" });
    await expect(q.getSubmissionForPartner(partner2Ctx, partnerSubmissionId)).rejects.toMatchObject({ code: "not_found" });
    const board = await q.getPipelineBoard(employer, job.id);
    const card = board.columns.flatMap((c) => c.cards).find((c) => c.applicationId === accepted.applicationId);
    expect(card?.source).toBe("venkat_sai");

    const performance = await q.getPartnerPerformance({ kind: "partner", ctx: partnerCtx });
    expect(performance).toMatchObject({ profilesSubmitted: 1, accepted: 1, duplicates: 0, complaints: null });
    expect(performance.rates.acceptance).toBe(1);
    const staffView = await q.getPartnerPerformance({ kind: "staff", ctx: staffCtx, partnerOrganizationId: partner2Org.id });
    expect(staffView.duplicates).toBe(2);
    expect(staffView.complaints).toBe(0);
  });

  // ---------------------------------------------------------------- offers, placements, mobilisation
  it("runs offer → placement → overseas mobilisation → joining", async () => {
    const app = await svc.createApplication(sita, { jobId: overseasJob.id, consentToShare: true });
    await svc.transitionApplication(app.id, "selected", staff);
    await expect(svc.createOffer(employer, { applicationId: app.id, jobTitle: "Pipe Welder", salaryMinor: 300000, salaryCurrency: null, salaryPeriod: "month" })).rejects.toThrow();
    const offer = await svc.createOffer(employer, { applicationId: app.id, jobTitle: "Pipe Welder", salaryMinor: 300000, salaryCurrency: "AED", salaryPeriod: "month", countryCode: "AE" });
    await expect(svc.createOffer(staff, { applicationId: app.id, jobTitle: "Second" })).rejects.toMatchObject({ code: "offer_open" });
    await expect(svc.respondToOffer(sita, { offerId: offer.id, response: "accept" })).rejects.toMatchObject({ code: "not_found" });
    await svc.issueOffer(employer, { offerId: offer.id, expiresAt: new Date(Date.now() + 7 * DAY) });
    expect((await queuedNotifications("offer.issued")).some((n) => n.dedupe_key?.includes(offer.id))).toBe(true);
    const candidateOffers = await q.listOffersForCandidate(sita, { applicationId: app.id });
    expect(candidateOffers[0]).toMatchObject({ status: "issued", canRespond: true });
    expect(JSON.stringify(candidateOffers)).not.toContain("internalNotes");

    const accepted = await svc.respondToOffer(sita, { offerId: offer.id, response: "accept" });
    expect(accepted.placementId).toBeTruthy();
    expect(accepted.mobilisationId).toBeTruthy();
    const [placement] = await db.select().from(s.placements).where(eq(s.placements.id, accepted.placementId!));
    expect(placement).toMatchObject({ status: "pending_joining", countryCode: "AE", salaryCurrency: "AED", salaryMinor: 300000 });
    const checklist = await db.select().from(s.mobilisationChecklistItems).where(eq(s.mobilisationChecklistItems.mobilisationId, accepted.mobilisationId!));
    expect(checklist).toHaveLength(8);
    expect(checklist.find((c) => c.key === "emigration_clearance")?.isRequired).toBe(true);
    const [stageRow] = await db.select({ key: s.workflowStages.key }).from(s.applications).innerJoin(s.workflowStages, eq(s.workflowStages.id, s.applications.currentStageId)).where(eq(s.applications.id, app.id));
    expect(stageRow!.key).toBe("offer_accepted");

    const mobilisationId = accepted.mobilisationId!;
    await expect(svc.updateMobilisation(staffCtx, { mobilisationId, status: "travel_booked" })).rejects.toMatchObject({ code: "mobilisation_gate" });
    await svc.updateMobilisation(staffCtx, { mobilisationId, status: "visa_processing", visaNumber: "AE 1234 5678" });
    const [record] = await db.select().from(s.mobilisationRecords).where(eq(s.mobilisationRecords.id, mobilisationId));
    expect(record).toMatchObject({ status: "visa_processing", visaNumberLast4: "5678" });
    expect(record!.visaNumberEncrypted).not.toContain("12345678");
    const [placementAfter] = await db.select().from(s.placements).where(eq(s.placements.id, accepted.placementId!));
    expect(placementAfter!.status).toBe("mobilising");

    await svc.updateMobilisation(staffCtx, { mobilisationId, emigrationClearanceStatus: "granted", visaStatus: "issued", medicalStatus: "fit", status: "travel_booked", travelDate: "2030-01-05" });
    await expect(svc.updateMobilisation(staffCtx, { mobilisationId, status: "departed" })).rejects.toMatchObject({ code: "mobilisation_gate" });
    const passportItem = checklist.find((c) => c.key === "passport_validity")!;
    const fileId = await makeFile(sita.userId, "mobilisation_document");
    await svc.submitChecklistItem(sita, { itemId: passportItem.id, fileId });
    await svc.reviewChecklistItem(staffCtx, { itemId: passportItem.id, decision: "rejected", rejectionReason: "Blurred scan" });
    expect((await queuedNotifications("placement.mobilisation_update")).some((n) => n.dedupe_key?.includes(passportItem.id))).toBe(true);
    for (const item of checklist) await svc.reviewChecklistItem(staffCtx, { itemId: item.id, decision: item.key === "insurance" ? "not_applicable" : "verified" });
    await svc.updateMobilisation(staffCtx, { mobilisationId, status: "departed" });

    const candidateMobilisation = await q.getMobilisationForCandidate(sita, app.id);
    expect(candidateMobilisation).toMatchObject({ status: "departed", statusLabel: "Departed" });
    expect(JSON.stringify(candidateMobilisation)).not.toMatch(/visaNumber|notes/);

    await expect(svc.confirmJoined(otherEmployer, { placementId: accepted.placementId!, joinedOn: new Date().toISOString().slice(0, 10) })).rejects.toMatchObject({ code: "not_found" });
    await svc.confirmJoined(employer, { placementId: accepted.placementId!, joinedOn: new Date().toISOString().slice(0, 10) });
    const [joined] = await db.select().from(s.applications).where(eq(s.applications.id, app.id));
    expect(joined).toMatchObject({ status: "hired" });
    expect(joined!.hiredAt).toBeInstanceOf(Date);
    const [finalPlacement] = await db.select().from(s.placements).where(eq(s.placements.id, accepted.placementId!));
    expect(finalPlacement!.status).toBe("joined");
    expect((await queuedNotifications("placement.joined")).length).toBeGreaterThanOrEqual(2);
  });

  it("runs the task handlers: reminders chain the hourly expiry tasks; attributions expire", async () => {
    const { tasks } = await import("./tasks");
    const logs: string[] = [];
    const taskCtx = { taskId: 1, attempt: 1, log: (message: string) => void logs.push(message) };
    await tasks["recruitment.interview_reminders"]!({}, taskCtx);
    const hour = new Date().toISOString().slice(0, 13);
    const chained = await db.execute<{ type: string }>(sql`select type from background_jobs where dedupe_key in (${`recruitment.expire_offers:${hour}`}, ${`recruitment.expire_attributions:${hour}`})`);
    expect(chained.rows.map((r) => r.type).sort()).toEqual(["recruitment.expire_attributions", "recruitment.expire_offers"]);

    const [active] = await db.select().from(s.candidateAttributions).where(eq(s.candidateAttributions.status, "active")).limit(1);
    await db.update(s.candidateAttributions).set({ firstSubmittedAt: new Date(Date.now() - 10 * DAY), expiresAt: new Date(Date.now() - 1000) }).where(eq(s.candidateAttributions.id, active!.id));
    await tasks["recruitment.expire_attributions"]!({}, taskCtx);
    const [expired] = await db.select().from(s.candidateAttributions).where(eq(s.candidateAttributions.id, active!.id));
    expect(expired!.status).toBe("expired");
    await tasks["recruitment.expire_offers"]!({}, taskCtx);
    expect(logs).toEqual(expect.arrayContaining(["Interview reminders processed", "Attribution expiry processed", "Offer expiry processed"]));
  });

  it("expires issued offers past their deadline", async () => {
    const app = await svc.createApplication(sita, { jobId: job.id, consentToShare: true, answers: { [passportQuestion!.id]: true } });
    const offer = await svc.createOffer(staff, { applicationId: app.id, jobTitle: "TIG Welder" });
    await svc.issueOffer(staff, { offerId: offer.id, expiresAt: new Date(Date.now() + DAY) });
    await db.update(s.offers).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(s.offers.id, offer.id));
    expect(await svc.expireDueOffers()).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(s.offers).where(eq(s.offers.id, offer.id));
    expect(row!.status).toBe("expired");
    await expect(svc.respondToOffer(sita, { offerId: offer.id, response: "accept" })).rejects.toMatchObject({ code: "offer_status" });
  });

  it("serves the remaining read models and review actions", async () => {
    // Interviews: reschedule, cancel, complete with feedback, and every calendar view.
    const [interview] = await db.select().from(s.interviews).where(eq(s.interviews.applicationId, raviApplicationId)).limit(1);
    await svc.rescheduleInterview(employer, { interviewId: interview!.id, startsAtLocal: "2031-02-01T09:30", timezone: "Asia/Kolkata", durationMinutes: 30, reason: "Panel unavailable" });
    const [rescheduled] = await db.select().from(s.interviews).where(eq(s.interviews.id, interview!.id));
    expect(rescheduled).toMatchObject({ status: "rescheduled", candidateResponse: "pending", timezone: "Asia/Kolkata" });
    expect(rescheduled!.scheduledStart.toISOString()).toBe("2031-02-01T04:00:00.000Z");
    await svc.cancelInterview(employer, { interviewId: interview!.id, reason: "Position re-scoped" });
    await expect(svc.cancelInterview(employer, { interviewId: interview!.id, reason: "again" })).rejects.toMatchObject({ code: "interview_closed" });
    const second = await svc.scheduleInterview(staff, { applicationId: raviApplicationId, roundName: "Trade test", mode: "trade_test", startsAtLocal: "2031-03-01T10:00", timezone: "Asia/Kolkata", durationMinutes: 120 });
    const [tradeTest] = await db.select().from(s.interviews).where(eq(s.interviews.id, second.id));
    expect(tradeTest!.organizationId).toBeNull();
    await expect(svc.submitInterviewFeedback(employer, { interviewId: second.id, recommendation: "yes" })).rejects.toMatchObject({ code: "interview_not_started" });
    await svc.completeInterview(staff, { interviewId: second.id, status: "completed", outcome: "passed" });
    await svc.submitInterviewFeedback(staff, { interviewId: second.id, rating: 4, recommendation: "strong_yes", scorecard: [{ criterion: "Weld quality", score: 8, maxScore: 10 }] });
    await svc.submitInterviewFeedback(staff, { interviewId: second.id, rating: 5, recommendation: "strong_yes" });
    const feedback = await db.select().from(s.interviewFeedback).where(eq(s.interviewFeedback.interviewId, second.id));
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.rating).toBe(5);
    const staffView = (await q.listInterviewsForApplication(staff, raviApplicationId)).find((v) => v.id === second.id);
    expect(staffView?.feedback).toHaveLength(1);
    const employerView = (await q.listInterviewsForApplication(employer, raviApplicationId)).find((v) => v.id === second.id);
    expect(employerView?.feedback).toEqual([]);
    expect((await q.listInterviewsForEmployer(employerCtx, {}, page)).total).toBeGreaterThanOrEqual(2);
    expect((await q.listInterviewsForStaff(staffCtx, { status: "completed" }, page)).items.map((i) => i.id)).toContain(second.id);
    expect((await q.listInterviewsForPartner(partnerCtx, {}, page)).total).toBe(0);
    expect((await q.getInterview(employer, interview!.id)).status).toBe("cancelled");

    // Offers, placements and mobilisation lists.
    expect((await q.listOffersForEmployer(employerCtx, {}, page)).total).toBeGreaterThanOrEqual(2);
    expect((await q.listOffersForStaff(staffCtx, { status: "expired" }, page)).total).toBeGreaterThanOrEqual(1);
    const placementsForEmployer = await q.listPlacementsForEmployer(employerCtx, { status: "joined" }, page);
    expect(placementsForEmployer.items[0]).toMatchObject({ status: "joined", feeMinor: null, notes: null });
    const placementsForStaff = await q.listPlacementsForStaff(staffCtx, { status: "joined" }, page);
    expect(placementsForStaff.total).toBeGreaterThanOrEqual(1);
    const placementId = placementsForEmployer.items[0]!.id;
    const mobilisations = await q.listMobilisationsForStaff(staffCtx, { status: "completed" }, page);
    expect(mobilisations.total).toBeGreaterThanOrEqual(1);
    expect(mobilisations.items.every((m) => m.status === "completed")).toBe(true);
    const [mobilisationRow] = await db.select({ id: s.mobilisationRecords.id }).from(s.mobilisationRecords).where(eq(s.mobilisationRecords.placementId, placementId));
    const mobilisation = await q.getMobilisationForStaff(staffCtx, mobilisationRow!.id);
    expect(mobilisation).toMatchObject({ status: "completed", placementId });
    expect(mobilisation.checklist).toHaveLength(8);
    expect(mobilisation.checklist.every((c) => c.status === "verified" || c.status === "not_applicable")).toBe(true);
    await expect(q.getMobilisationForPartner(partnerCtx, placementId)).rejects.toMatchObject({ code: "not_found" });
    await svc.updatePlacement(staff, { placementId, feeMinor: 150000, feeCurrency: "AED", replacementDeadline: "2031-06-30" });
    await expect(svc.updatePlacement(employer, { placementId, feeMinor: 1 })).rejects.toThrow(/currency/);
    await expect(svc.updatePlacement(employer, { placementId, feeMinor: 1, feeCurrency: "AED" })).rejects.toMatchObject({ code: "forbidden" });
    await svc.updatePlacement(employer, { placementId, status: "replacement_required", reason: "Left within the guarantee period" });
    const [replaced] = await db.select().from(s.placements).where(eq(s.placements.id, placementId));
    expect(replaced).toMatchObject({ status: "replacement_required", feeMinor: 150000, feeCurrency: "AED" });

    // Partner workflow reviews and staff lists.
    const assignments = await q.listAssignmentsForStaff(staffCtx, { partnerOrganizationId: partner2Org.id }, page);
    expect(assignments.total).toBeGreaterThanOrEqual(3);
    expect(assignments.items[0]).toHaveProperty("internalNotes");
    const assignmentView = await q.getAssignmentForPartner(partner2Ctx, partner2AssignmentId);
    expect(assignmentView.submissionCounts.duplicate).toBe(1);
    await expect(q.getAssignmentForPartner(partnerCtx, partner2AssignmentId)).rejects.toMatchObject({ code: "not_found" });

    const [duplicate] = await db.select().from(s.partnerSubmissions).where(and(eq(s.partnerSubmissions.assignmentId, partner2AssignmentId), eq(s.partnerSubmissions.status, "duplicate")));
    await svc.reopenDuplicateSubmission(staffCtx, { submissionId: duplicate!.id, reviewNotes: "Attribution checked" });
    await svc.rejectPartnerSubmission(staffCtx, { submissionId: duplicate!.id, rejectionReasonCode: "duplicate", partnerFeedback: "Already represented" });
    const [rejected] = await db.select().from(s.partnerSubmissions).where(eq(s.partnerSubmissions.id, duplicate!.id));
    expect(rejected).toMatchObject({ status: "rejected", rejectionReasonCode: "duplicate", partnerFeedback: "Already represented" });
    const partnerList = await q.listSubmissionsForPartner(partner2Ctx, { status: "rejected" }, page);
    expect(partnerList.items.find((i) => i.id === duplicate!.id)).toMatchObject({ partnerFeedback: "Already represented", rejectionReasonCode: "duplicate" });

    const [open] = await db.select().from(s.partnerSubmissions).where(and(eq(s.partnerSubmissions.partnerOrganizationId, partner2Org.id), eq(s.partnerSubmissions.status, "submitted")));
    await expect(svc.withdrawPartnerSubmission(partnerCtx, open!.id)).rejects.toMatchObject({ code: "not_found" });
    await svc.withdrawPartnerSubmission(partner2Ctx, open!.id);

    const [flag] = await db.select().from(s.duplicateFlags).where(eq(s.duplicateFlags.status, "open")).limit(1);
    await svc.resolveDuplicateFlag(staffCtx, { flagId: flag!.id, status: "not_duplicate", resolutionNotes: "Different people" });
    await expect(svc.resolveDuplicateFlag(staffCtx, { flagId: flag!.id, status: "merged" })).rejects.toMatchObject({ code: "not_found" });

    const [attribution] = await db.select().from(s.candidateAttributions).limit(1);
    await svc.updateAttribution(staffCtx, { attributionId: attribution!.id, status: "disputed", resolutionNotes: "Both partners claim the candidate" });
    const [disputed] = await db.select().from(s.candidateAttributions).where(eq(s.candidateAttributions.id, attribution!.id));
    expect(disputed).toMatchObject({ status: "disputed", resolvedByUserId: staffUser.id });

    // Partner notes on the application credited to the partner.
    const [accepted] = await db.select().from(s.partnerSubmissions).where(eq(s.partnerSubmissions.id, partnerSubmissionId));
    await svc.addApplicationNote(svc.asPartner(partnerCtx), { applicationId: accepted!.applicationId!, body: "Candidate available from March" });
    await svc.addApplicationNote(staff, { applicationId: accepted!.applicationId!, body: "Staff only", visibility: "staff_only" });
    const partnerNotes = await q.listApplicationNotes(svc.asPartner(partnerCtx), accepted!.applicationId!);
    expect(partnerNotes.map((n) => n.body)).toEqual(["Candidate available from March"]);
    expect(partnerNotes[0]).toMatchObject({ visibility: "staff_and_partner", authorParty: "partner", canEdit: true });
    await expect(q.listApplicationNotes(svc.asPartner(partner2Ctx), accepted!.applicationId!)).rejects.toMatchObject({ code: "not_found" });

    const options = await q.getApplicationStageOptions(employer, accepted!.applicationId!);
    expect(options.current.key).toBe("submitted");
    expect(options.allowed.map((o) => o.key)).not.toContain("documentation");
    expect((await q.listUnlocksForOrg(employerCtx, page)).total).toBeGreaterThanOrEqual(1);
  });
});
