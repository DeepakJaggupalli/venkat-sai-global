import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Integration tests of the jobs module against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_candjobs
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_candjobs'; npx vitest run src/modules/jobs
 * Skipped unless DATABASE_URL points at a vsg_test_* database.
 */
const env = vi.hoisted(() => {
  const url = process.env.DATABASE_URL;
  let name = "";
  try {
    name = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    name = "";
  }
  if (!url) process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";
  return { integration: name.startsWith("vsg_test_") };
});

import { db, pool } from "@/db";
import { approvalRequests, backgroundJobs, jobAlerts, jobs, jobScreeningQuestions, jobSkills, partnerLicences, skills } from "@/db/schema";
import { decideApproval } from "@/modules/approvals/service";
import { selfActor } from "@/modules/candidates/actor";
import { ensureCandidateProfile, getCandidateById } from "@/modules/candidates/guard";
import { updateJobPreferences, updatePersonalDetails } from "@/modules/candidates/profile-service";
import { personalSchema, preferencesSchema, preferredLocationsSchema, skillsSchema } from "@/modules/candidates/schemas";
import { replaceCandidateSkills, replacePreferredLocations } from "@/modules/candidates/skills-service";
import { createFileRow, createOrganization, createTestUser, orgContext, RUN, seedReferenceData, staffContext, type ReferenceData } from "@/modules/candidates/test-fixtures";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import type { TaskContext } from "@/server/tasks/types";

import { createJob, deleteJob, duplicateJob, updateJob } from "./job-service";
import { closeJob, extendJob, pauseJob, publishJob, reopenJob, resumeJob, submitJob, withdrawJobSubmission } from "./lifecycle-service";
import { featureJob, setJobRecruitingAgent } from "./promotion-service";
import { getManagedJob, getPublicJobBySlug, listAdminJobs, listEmployerJobs } from "./queries";
import { getRecommendedJobs } from "./recommendations";
import { listSavedJobs, saveJob, saveJobAlert } from "./saved-alerts-service";
import { jobAlertSchema, jobFormSchema, parseJobSearchParams, recruitingAgentSchema, type JobFormValues } from "./schemas";
import { searchJobs } from "./search";
import { buildJobPostingJsonLd } from "./structured-data";
import { tasks } from "./tasks";
import type { JobActor, JobRow } from "./types";
import { recordJobView } from "./views";

const taskCtx: TaskContext = { taskId: 0, attempt: 1, log: () => undefined };
const DAY = 86_400_000;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

async function queued(type: string, event: string, match: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({ payload: backgroundJobs.payload })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, type), sql`${backgroundJobs.payload}->>'event' = ${event}`, sql`${backgroundJobs.payload} @> ${JSON.stringify(match)}::jsonb`));
  return rows.map((r) => r.payload);
}

describe.skipIf(!env.integration)("jobs module (integration)", () => {
  const token = `ww${RUN}`;
  let ref: ReferenceData;
  let org: Awaited<ReturnType<typeof createOrganization>>;
  let employerCtx: OrgContext<"employer">;
  let staffCtx: StaffContext;
  let employer: JobActor;
  let staff: JobActor;
  let approver: Awaited<ReturnType<typeof staffContext>>;
  let welder: JobRow;
  let rigger: JobRow;
  let accountant: JobRow;
  let remote: JobRow;
  let intern: JobRow;

  const welderInput = (overrides: Partial<JobFormValues> = {}): JobFormValues => ({
    title: `Pipe welder ${token}`,
    summary: "Shop and site welding for a refinery shutdown.",
    descriptionHtml: "<p>Weld carbon steel pipe.</p><script>alert('x')</script><a href=\"javascript:alert(1)\">x</a>",
    jobCategoryId: ref.pipeWeldingCategoryId,
    countryCode: "QA",
    city: "Doha",
    employmentType: "full_time",
    workMode: "on_site",
    experienceMinYears: "3",
    experienceMaxYears: "8",
    salaryMin: "2500",
    salaryMax: "3200",
    salaryCurrency: "QAR",
    salaryPeriod: "month",
    salaryVisible: "on",
    benefits: ["Accommodation", "Transport"],
    accommodationProvided: "yes",
    skills: [
      { skillId: ref.skills.gtaw, isRequired: true },
      { skillId: ref.skills.smaw, isRequired: false },
    ],
    screeningQuestions: [{ question: "Do you hold a valid passport?", type: "yes_no", knockout: { kind: "equals", value: false } }],
    ...overrides,
  });

  beforeAll(async () => {
    ref = await seedReferenceData();
    org = await createOrganization("employer", { name: `Gulf Fabrication ${token}` });
    employerCtx = await orgContext("employer", org, ["employer.jobs.view", "employer.jobs.manage"]);
    staffCtx = await staffContext("jobs.view", "jobs.manage", "jobs.approve", "jobs.feature");
    employer = { kind: "employer", ctx: employerCtx };
    staff = { kind: "staff", ctx: staffCtx };
    approver = await staffContext("approvals.view", "approvals.decide", "jobs.approve", "jobs.view");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a sanitised draft with code, slug and denormalised search columns", async () => {
    welder = await createJob(employer, jobFormSchema.parse(welderInput()));
    expect(welder).toMatchObject({ status: "draft", organizationId: org.id, infoSource: "pending_review", isOverseas: true, categoryNameCache: "Pipe welding", managedByVenkatSai: false });
    expect(welder.code).toMatch(/^VSG-JOB-\d{6}$/);
    expect(welder.slug).toMatch(/^pipe-welder-ww[0-9a-f]+-doha-\d{6}$/);
    expect(welder.descriptionHtml).toBe('<p>Weld carbon steel pipe.</p><a>x</a>');
    expect(welder.skillsText).toContain("TIG welding");
    expect(welder.salaryMinMinor).toBe(250_000);
    expect(await db.select().from(jobSkills).where(eq(jobSkills.jobId, welder.id))).toHaveLength(2);
    const [question] = await db.select().from(jobScreeningQuestions).where(eq(jobScreeningQuestions.jobId, welder.id));
    expect(question?.knockoutAnswer).toEqual({ kind: "equals", value: false });
  });

  it("refreshes job search text after a skill's synonyms change", async () => {
    await db.update(skills).set({ synonyms: ["TIG welding", `argon arc ${token}`] }).where(eq(skills.id, ref.skills.gtaw));
    try {
      await tasks["jobs.refresh_skill"]!({ id: ref.skills.gtaw }, taskCtx);
      const [row] = await db.select({ skillsText: jobs.skillsText }).from(jobs).where(eq(jobs.id, welder.id));
      expect(row?.skillsText).toContain(`argon arc ${token}`);
    } finally {
      await db.update(skills).set({ synonyms: ["TIG welding"] }).where(eq(skills.id, ref.skills.gtaw));
      await tasks["jobs.refresh_skill"]!({ id: ref.skills.gtaw }, taskCtx);
    }
  });

  it("refuses publication while the organisation is not verified", async () => {
    const pendingOrg = await createOrganization("employer", { status: "pending" });
    const pending: JobActor = { kind: "employer", ctx: await orgContext("employer", pendingOrg, ["employer.jobs.view", "employer.jobs.manage"]) };
    const draft = await createJob(pending, jobFormSchema.parse(welderInput({ title: `Fitter ${token}` })));
    await expect(submitJob(pending, draft.id)).rejects.toMatchObject({ code: "org_not_verified" });
    // Another organisation's job is invisible.
    await expect(pauseJob(employer, draft.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("publishes on approval with the default listing window and notifies the organisation", async () => {
    const submitted = await submitJob(employer, welder.id);
    expect(submitted.status).toBe("pending_approval");
    const [request] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, welder.id), eq(approvalRequests.status, "pending")));
    expect(request?.type).toBe("job_publication");
    expect(request?.payload).toMatchObject({ compliance: { overseas: true, recruitingAgentRecorded: false }, organization: org.name });

    await decideApproval({ requestId: request!.id, decision: "approved", reason: null, ctx: approver });
    const [published] = await db.select().from(jobs).where(eq(jobs.id, welder.id));
    expect(published).toMatchObject({ status: "published", verifiedEmployer: true, infoSource: "employer_supplied", moderationNote: null });
    expect(Math.abs(published!.publishedAt!.getTime() - Date.now())).toBeLessThan(60_000);
    expect(published!.expiresAt!.getTime() - published!.publishedAt!.getTime()).toBeGreaterThan(29 * DAY);
    expect(await queued("notifications.dispatch_org", "job.approved", { organizationId: org.id })).not.toHaveLength(0);
    // job.approved is the submitter's notification; the generic approval.decided is not sent as well.
    expect(await queued("notifications.dispatch", "approval.decided", { data: { code: request!.code } })).toHaveLength(0);
    welder = published!;
  });

  it("shows the published job publicly without knockout rules, and hides drafts", async () => {
    const detail = await getPublicJobBySlug(welder.slug);
    expect(detail).toMatchObject({ title: welder.title, isOverseas: true, recruitingAgent: null, screeningRequired: false });
    expect(detail?.employer).toMatchObject({ confidential: false, name: org.name, verified: true });
    expect(detail?.salary).toEqual({ minMinor: 250_000, maxMinor: 320_000, currency: "QAR", period: "month" });
    expect(detail?.screeningQuestions[0]).not.toHaveProperty("knockout");
    expect(detail?.skillDetails.map((s) => s.name)).toEqual(["GTAW", "SMAW"]);
    const jsonLd = buildJobPostingJsonLd(detail!, { url: `https://example.test/jobs/${detail!.slug}` });
    expect(jsonLd).toMatchObject({ "@type": "JobPosting", employmentType: "FULL_TIME", hiringOrganization: { name: org.name } });

    const draft = await createJob(employer, jobFormSchema.parse(welderInput({ title: `Draft only ${token}` })));
    expect(await getPublicJobBySlug(draft.slug)).toBeNull();
  });

  it("applies changes-requested and rejection decisions with the reviewer's reason", async () => {
    const job = await createJob(employer, jobFormSchema.parse(welderInput({ title: `Structural welder ${token}` })));
    await submitJob(employer, job.id);
    const open = async () => (await db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, job.id), sql`${approvalRequests.status} in ('pending', 'changes_requested')`)))[0]!;
    await decideApproval({ requestId: (await open()).id, decision: "changes_requested", reason: "Add the working hours", ctx: approver });
    let [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row).toMatchObject({ status: "changes_requested", moderationNote: "Add the working hours" });
    expect(await queued("notifications.dispatch_org", "job.changes_requested", { organizationId: org.id })).not.toHaveLength(0);

    await submitJob(employer, job.id);
    const rejected = await decideApproval({ requestId: (await open()).id, decision: "rejected", reason: "Duplicate of an existing job", ctx: approver });
    [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row).toMatchObject({ status: "rejected", moderationNote: "Duplicate of an existing job" });
    expect(await queued("notifications.dispatch_org", "job.rejected", { organizationId: org.id })).not.toHaveLength(0);
    expect(await queued("notifications.dispatch", "approval.decided", { data: { code: rejected.code } })).toHaveLength(0);
  });

  it("sends substantive edits of a live job back to review, but not minor ones", async () => {
    const minor = await updateJob(employer, welder.id, jobFormSchema.parse(welderInput({ openings: "5" })));
    expect(minor).toMatchObject({ sentForReview: false, job: { status: "published", openings: 5 } });

    const major = await updateJob(employer, welder.id, jobFormSchema.parse(welderInput({ openings: "5", salaryMax: "3000" })));
    expect(major.sentForReview).toBe(true);
    expect(major.job).toMatchObject({ status: "pending_approval", infoSource: "pending_review", slug: welder.slug });
    expect(await getPublicJobBySlug(welder.slug)).toBeNull();

    const [request] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, welder.id), eq(approvalRequests.status, "pending")));
    await decideApproval({ requestId: request!.id, decision: "approved", reason: null, ctx: approver });
    const [again] = await db.select().from(jobs).where(eq(jobs.id, welder.id));
    // Re-approval keeps the first publication date: an edited job never looks new.
    expect(again!.publishedAt!.getTime()).toBe(welder.publishedAt!.getTime());
    welder = again!;
  });

  it("lets staff publish a confidential Venkat Sai job that never exposes an organisation", async () => {
    rigger = await createJob(
      staff,
      jobFormSchema.parse({ title: `Rigger ${token}`, countryCode: "AE", city: "Abu Dhabi", isConfidential: "on", confidentialEmployerName: "EPC contractor, UAE", employmentType: "contract", descriptionHtml: "<p>Rigging and slinging.</p>" }),
    );
    expect(rigger).toMatchObject({ organizationId: null, managedByVenkatSai: true });
    rigger = await publishJob(staff, rigger.id, { infoVerified: true });
    expect(rigger).toMatchObject({ status: "published", infoSource: "verified", verifiedEmployer: false });
    const detail = await getPublicJobBySlug(rigger.slug);
    expect(detail?.employer).toEqual(expect.objectContaining({ confidential: true, name: "EPC contractor, UAE", organizationId: null, slug: null, logoUrl: null }));
    expect(detail?.employerProfile).toBeNull();
  });

  describe("search", () => {
    beforeAll(async () => {
      accountant = await publishJob(
        staff,
        (
          await createJob(
            staff,
            jobFormSchema.parse({
              title: `Accountant ${token}`,
              organizationId: org.id,
              countryCode: "IN",
              stateRegion: "Andhra Pradesh",
              city: "Visakhapatnam",
              jobCategoryId: ref.financeCategoryId,
              experienceMinYears: "1",
              experienceMaxYears: "3",
              salaryMin: "30000",
              salaryMax: "40000",
              salaryCurrency: "INR",
              salaryPeriod: "month",
              salaryVisible: "on",
              summary: "Accounts for a fabrication workshop.",
              skills: [{ skillId: ref.skills.tally, isRequired: true }],
            }),
          )
        ).id,
      );
      remote = await publishJob(staff, (await createJob(staff, jobFormSchema.parse({ title: `Remote CAD drafter ${token}`, organizationId: org.id, workMode: "remote", countryCode: "IN", employmentType: "part_time", summary: "Piping isometrics." }))).id);
      intern = await publishJob(
        staff,
        (
          await createJob(
            staff,
            jobFormSchema.parse({ title: `Welding intern ${token}`, organizationId: org.id, countryCode: "IN", city: "Chennai", employmentType: "internship", jobCategoryId: ref.weldingCategoryId, summary: "Learn on the shop floor.", applicationDeadline: isoDate(2) }),
          )
        ).id,
      );
    });

    const ids = async (params: Record<string, string>, audience: Parameters<typeof searchJobs>[1] = { kind: "public" }) =>
      (await searchJobs(parseJobSearchParams({ q: token, pageSize: "50", ...params }), audience, { facets: false })).items.map((i) => i.id).sort();

    it("lists every public job of the run and nothing unpublished", async () => {
      expect(await ids({})).toEqual([welder.id, rigger.id, accountant.id, remote.id, intern.id].sort());
    });

    it("filters by keywords, category (with sub-categories), country and overseas", async () => {
      expect(await ids({ q: `accountant ${token}` })).toEqual([accountant.id]);
      expect(await ids({ category: ref.weldingCategoryId })).toEqual([welder.id, intern.id].sort());
      expect(await ids({ country: "AE" })).toEqual([rigger.id]);
      expect(await ids({ overseas: "1" })).toEqual([welder.id, rigger.id].sort());
      expect(await ids({ location: "visakha" })).toEqual([accountant.id]);
    });

    it("filters by experience, employment type, work mode, closing soon and salary band", async () => {
      expect(await ids({ experienceYears: "2" })).toEqual([rigger.id, accountant.id, remote.id, intern.id].sort());
      expect(await ids({ type: "internship" })).toEqual([intern.id]);
      expect(await ids({ mode: "remote" })).toEqual([remote.id]);
      expect(await ids({ closingWithinDays: "3" })).toEqual([intern.id]);
      expect(await ids({ salaryMin: "2900", salaryMax: "4000", salaryCurrency: "QAR", salaryPeriod: "month" })).toEqual([welder.id]);
      expect(await ids({ salaryMin: "35000", salaryCurrency: "INR", salaryPeriod: "month" })).toEqual([accountant.id]);
    });

    it("hides salaries the employer did not publish (and never filters on them publicly)", async () => {
      await db.update(jobs).set({ salaryVisible: false }).where(eq(jobs.id, accountant.id));
      expect(await ids({ salaryMin: "35000", salaryCurrency: "INR", salaryPeriod: "month" })).toEqual([]);
      const publicCard = (await searchJobs(parseJobSearchParams({ q: `accountant ${token}` }), { kind: "public" })).items[0];
      expect(publicCard?.salary).toBeNull();
      const adminCard = (await listAdminJobs(staffCtx, parseJobSearchParams({ q: `accountant ${token}` }))).items[0];
      expect(adminCard?.salary).toMatchObject({ currency: "INR", minMinor: 3_000_000 });
      expect(adminCard?.organizationName).toBe(org.name);
    });

    it("sorts by closing date and puts featured jobs first, labelled", async () => {
      expect((await searchJobs(parseJobSearchParams({ q: token, sort: "closing" }), { kind: "public" })).items[0]?.id).toBe(intern.id);
      await featureJob(staff, remote.id, { type: "featured", until: isoDate(7) });
      const result = await searchJobs(parseJobSearchParams({ q: token }), { kind: "public" });
      expect(result.items[0]).toMatchObject({ id: remote.id, isFeatured: true });
      expect(await ids({ featuredOnly: "1" })).toEqual([remote.id]);
    });

    it("returns disjunctive facet counts", async () => {
      const result = await searchJobs(parseJobSearchParams({ q: token, type: "internship" }), { kind: "public" });
      expect(result.total).toBe(1);
      // The employment-type facet ignores its own filter so every type keeps its count.
      const types = Object.fromEntries(result.facets!.employmentTypes.map((b) => [b.value, b.count]));
      expect(types).toMatchObject({ full_time: 2, contract: 1, part_time: 1, internship: 1 });
      expect(result.facets!.overseas).toBe(0);
      const all = await searchJobs(parseJobSearchParams({ q: token }), { kind: "public" });
      expect(all.facets!.overseas).toBe(2);
      expect(Object.fromEntries(all.facets!.countries.map((b) => [b.value, b.count]))).toMatchObject({ IN: 3, QA: 1, AE: 1 });
    });

    it("scopes employer lists to the organisation, in every status", async () => {
      const list = await listEmployerJobs(employerCtx, parseJobSearchParams({ q: token, pageSize: "50" }));
      const statuses = new Set(list.items.map((i) => i.status));
      expect(statuses.has("draft")).toBe(true);
      expect(statuses.has("rejected")).toBe(true);
      expect(list.items.some((i) => i.id === rigger.id)).toBe(false);
      const drafts = await listEmployerJobs(employerCtx, parseJobSearchParams({ q: token, statuses: "draft" }));
      expect(drafts.items.every((i) => i.status === "draft")).toBe(true);
    });
  });

  describe("candidate tools", () => {
    let user: Awaited<ReturnType<typeof createTestUser>>;
    let candidateId: string;

    beforeAll(async () => {
      user = await createTestUser({ name: "Suresh Babu" });
      const candidate = await ensureCandidateProfile(user.id);
      candidateId = candidate.id;
      const actor = selfActor({ user, candidate });
      await updatePersonalDetails(actor, personalSchema.parse({ currentCountryCode: "IN", city: "Visakhapatnam", dateOfBirth: "1992-02-02" }));
      await updateJobPreferences(actor, preferencesSchema.parse({ preferredCategoryIds: [ref.pipeWeldingCategoryId], openToOverseas: "on", desiredEmploymentTypes: ["full_time"] }));
      await replaceCandidateSkills(actor, skillsSchema.parse({ skills: [{ skillId: ref.skills.gtaw }, { skillId: ref.skills.smaw }] }));
      await replacePreferredLocations(actor, preferredLocationsSchema.parse({ locations: [{ countryCode: "QA" }] }));
    });

    it("recommends matching jobs with explainable reasons", async () => {
      const candidate = (await getCandidateById(candidateId))!;
      const recommended = await getRecommendedJobs(candidateId, { kind: "self", user, candidate });
      const top = recommended.find((r) => r.job.id === welder.id);
      expect(top).toBeDefined();
      expect(top!.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["skills_match", "preferred_category", "preferred_location"]));
      expect(recommended.some((r) => r.job.id === accountant.id)).toBe(false);
      await expect(getRecommendedJobs(candidateId, { kind: "staff", ctx: await staffContext("jobs.view") })).rejects.toMatchObject({ code: "forbidden" });
    });

    it("never recommends overseas jobs to a minor", async () => {
      const minorUser = await createTestUser({ name: "Teen Apprentice" });
      const minor = await ensureCandidateProfile(minorUser.id);
      await updatePersonalDetails(selfActor({ user: minorUser, candidate: minor }), personalSchema.parse({ dateOfBirth: "2012-01-01", currentCountryCode: "IN", city: "Chennai" }));
      await replaceCandidateSkills(selfActor({ user: minorUser, candidate: minor }), skillsSchema.parse({ skills: [{ skillId: ref.skills.gtaw }] }));
      // Even a stored overseas preference (recorded before the date of birth) is ignored for a minor.
      await db.execute(sql`update candidate_profiles set open_to_overseas = true where id = ${minor.id}`);
      const fresh = (await getCandidateById(minor.id))!;
      const recommended = await getRecommendedJobs(minor.id, { kind: "self", user: minorUser, candidate: fresh });
      expect(recommended.every((r) => !r.job.isOverseas)).toBe(true);
    });

    it("saves jobs, refuses unlisted ones and reports saved jobs that closed", async () => {
      await saveJob(user, welder.id);
      await saveJob(user, intern.id);
      await saveJob(user, intern.id);
      const draft = await createJob(employer, jobFormSchema.parse(welderInput({ title: `Unlisted ${token}` })));
      await expect(saveJob(user, draft.id)).rejects.toMatchObject({ code: "job_unavailable" });
      let saved = await listSavedJobs(user, { page: 1, pageSize: 20, offset: 0 }, { candidateId });
      expect(saved.items.map((i) => i.id).sort()).toEqual([welder.id, intern.id].sort());
      expect(saved.items.every((i) => i.isSaved)).toBe(true);
      await closeJob(staff, intern.id, "filled");
      saved = await listSavedJobs(user, { page: 1, pageSize: 20, offset: 0 });
      expect(saved.items.map((i) => i.id)).toEqual([welder.id]);
      expect(saved.unavailableCount).toBe(1);
      await reopenJob(staff, intern.id, { applicationDeadline: isoDate(10) });
    });

    it("counts a view at most once per viewer per day", async () => {
      const before = (await db.select({ viewCount: jobs.viewCount }).from(jobs).where(eq(jobs.id, welder.id)))[0]!.viewCount;
      expect(await recordJobView(welder.id, { userId: user.id })).toBe(true);
      expect(await recordJobView(welder.id, { userId: user.id })).toBe(false);
      const after = (await db.select({ viewCount: jobs.viewCount }).from(jobs).where(eq(jobs.id, welder.id)))[0]!.viewCount;
      expect(after).toBe(before + 1);
    });

    it("sends alert digests of newly published matching jobs, once per run", async () => {
      const alert = await saveJobAlert(user, jobAlertSchema.parse({ name: "Welding jobs", keywords: token, frequency: "daily", channels: ["email", "in_app"] }));
      await db.update(jobAlerts).set({ lastRunAt: new Date(Date.now() - 3 * DAY) }).where(eq(jobAlerts.id, alert.id));
      await db.update(jobs).set({ publishedAt: new Date(Date.now() - DAY) }).where(eq(jobs.id, rigger.id));
      await tasks["jobs.alerts_digest"]!({}, taskCtx);
      const digests = await queued("notifications.dispatch", "job.alert_digest", { recipients: [{ userId: user.id }] });
      expect(digests).toHaveLength(1);
      const data = digests[0]!.data as { alertName: string; count: number; jobs: { title: string; url: string }[] };
      expect(data.alertName).toBe("Welding jobs");
      expect(data.jobs.map((j) => j.title)).toContain(rigger.title);
      expect(data.jobs[0]!.url).toMatch(/^https?:\/\/.+\/jobs\//);
      const [row] = await db.select().from(jobAlerts).where(eq(jobAlerts.id, alert.id));
      expect(row!.lastSentAt).not.toBeNull();
      // Not due again the same day.
      await tasks["jobs.alerts_digest"]!({}, taskCtx);
      expect(await queued("notifications.dispatch", "job.alert_digest", { recipients: [{ userId: user.id }] })).toHaveLength(1);
    });
  });

  describe("lifecycle", () => {
    it("pauses, resumes, closes, reopens and extends", async () => {
      expect((await pauseJob(employer, welder.id)).status).toBe("paused");
      expect(await getPublicJobBySlug(welder.slug)).toBeNull();
      expect((await resumeJob(employer, welder.id)).status).toBe("published");
      expect((await closeJob(employer, welder.id, "filled")).closedReason).toBe("filled");
      await expect(extendJob(employer, welder.id, { applicationDeadline: isoDate(20) })).rejects.toMatchObject({ code: "invalid_status" });
      const reopened = await reopenJob(employer, welder.id, { applicationDeadline: isoDate(20) });
      expect(reopened.status).toBe("published");
      const extended = await extendJob(employer, welder.id, { expiresAt: isoDate(40) });
      expect(extended.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 39 * DAY);
      welder = extended;
    });

    it("refuses to delete live jobs, deletes drafts and withdraws submissions", async () => {
      await expect(deleteJob(employer, welder.id)).rejects.toMatchObject({ code: "invalid_status" });
      const draft = await createJob(employer, jobFormSchema.parse(welderInput({ title: `To delete ${token}` })));
      await submitJob(employer, draft.id);
      expect((await withdrawJobSubmission(employer, draft.id)).status).toBe("draft");
      await deleteJob(employer, draft.id);
      expect(await getManagedJob(employer, draft.id)).toBeNull();
    });

    it("duplicates a job into a new draft with its skills and questions", async () => {
      const copy = await duplicateJob(employer, welder.id);
      expect(copy).toMatchObject({ status: "draft", title: welder.title, publishedAt: null, viewCount: 0, recruitingAgentName: null });
      expect(copy.code).not.toBe(welder.code);
      const detail = await getManagedJob(employer, copy.id);
      expect(detail?.skills).toHaveLength(2);
      expect(detail?.screeningQuestions[0]?.knockout).toEqual({ kind: "equals", value: false });
    });

    it("closes jobs past their deadline and warns before deadlines", async () => {
      await db.update(jobs).set({ applicationDeadline: new Date(Date.now() - 60_000) }).where(eq(jobs.id, intern.id));
      await db.update(jobs).set({ applicationDeadline: new Date(Date.now() + DAY) }).where(eq(jobs.id, accountant.id));
      await tasks["jobs.close_expired"]!({}, taskCtx);
      const [closed] = await db.select().from(jobs).where(eq(jobs.id, intern.id));
      expect(closed).toMatchObject({ status: "closed", closedReason: "expired" });
      expect(await queued("notifications.dispatch_org", "job.expired", { organizationId: org.id })).not.toHaveLength(0);
      expect(await queued("notifications.dispatch_org", "job.closing_soon", { organizationId: org.id })).not.toHaveLength(0);
      // Idempotent: a second run neither re-closes nor duplicates the warning.
      await tasks["jobs.close_expired"]!({}, taskCtx);
      expect(await queued("notifications.dispatch_org", "job.closing_soon", { organizationId: org.id })).toHaveLength(1);
    });
  });

  describe("recruiting-agent transparency", () => {
    it("shows a verified, unexpired certificate on the public page only", async () => {
      await setJobRecruitingAgent(staff, recruitingAgentSchema.parse({ id: rigger.id, mode: "manual", name: "Venkat Sai Welding Works and Testing Center", certificateNumber: "B-0000/TEST", validUntil: isoDate(365) }));
      expect((await getPublicJobBySlug(rigger.slug))?.recruitingAgent).toMatchObject({ certificateNumber: "B-0000/TEST" });
      await expect(setJobRecruitingAgent(staff, recruitingAgentSchema.parse({ id: rigger.id, mode: "manual", name: "Agent", certificateNumber: "X", validUntil: isoDate(-1) }))).rejects.toBeTruthy();
      await db.update(jobs).set({ recruitingAgentCertificateValidUntil: isoDate(-1) }).where(eq(jobs.id, rigger.id));
      expect((await getPublicJobBySlug(rigger.slug))?.recruitingAgent).toBeNull();
    });

    it("copies a partner's verified recruiting-agent licence and refuses unverified ones", async () => {
      const partner = await createOrganization("recruitment_partner", { name: `Coastal Manpower ${token}` });
      const [unverified] = await db.insert(partnerLicences).values({ organizationId: partner.id, licenceType: "india_recruiting_agent", licenceNumber: `B-${RUN}-1`, issuingCountryCode: "IN" }).returning();
      await expect(setJobRecruitingAgent(staff, recruitingAgentSchema.parse({ id: rigger.id, mode: "licence", licenceId: unverified!.id }))).rejects.toBeTruthy();
      const scan = await createFileRow(staffCtx.user.id, "partner_licence", { organizationId: partner.id, name: "licence.pdf" });
      const [verified] = await db
        .insert(partnerLicences)
        .values({
          organizationId: partner.id,
          licenceType: "india_recruiting_agent",
          licenceNumber: `B-${RUN}-2`,
          issuingCountryCode: "IN",
          fileId: scan.id,
          verificationStatus: "verified",
          verifiedAt: new Date(),
          validUntil: isoDate(200),
        })
        .returning();
      const updated = await setJobRecruitingAgent(staff, recruitingAgentSchema.parse({ id: rigger.id, mode: "licence", licenceId: verified!.id }));
      expect(updated).toMatchObject({ recruitingAgentName: partner.name, recruitingAgentCertificateNumber: `B-${RUN}-2`, recruitingAgentLicenceId: verified!.id });
      await expect(setJobRecruitingAgent(employer, recruitingAgentSchema.parse({ id: rigger.id, mode: "clear" }))).rejects.toMatchObject({ code: "forbidden" });
    });
  });
});
