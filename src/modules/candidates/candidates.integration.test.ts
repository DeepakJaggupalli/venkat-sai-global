import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Integration tests of the candidates module against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_candjobs
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_candjobs'; npx vitest run src/modules/candidates
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
import {
  applications,
  approvalRequests,
  backgroundJobs,
  candidateAttributions,
  candidateDocuments,
  candidatePrivacySettings,
  candidateProfiles,
  candidateSkills,
  consentRecords,
  dataAccessLogs,
  fileAccessGrants,
  jobs,
  profileUnlocks,
  skillAssessments,
  skills,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { decideApproval } from "@/modules/approvals/service";

import { selfActor, staffActor } from "./actor";
import { saveEducation, saveExperience } from "./career-service";
import { refreshSkillCaches } from "./derived";
import { deleteCandidateDocument, saveCandidateCredential, saveCandidateDocument, submitCredentialForVerification, submitDocumentForVerification } from "./documents-service";
import { buildCandidateDataExport } from "./export";
import { ensureCandidateProfile, getCandidateById } from "./guard";
import { updateCandidateConsents, updatePrivacySettings, updateVisibility } from "./privacy-service";
import { updateJobPreferences, updatePersonalDetails, updateProfessionalSummary } from "./profile-service";
import { getCandidateProfileDetail } from "./queries";
import {
  candidateSearchFiltersSchema,
  credentialSchema,
  documentSchema,
  educationSchema,
  experienceSchema,
  languagesSchema,
  personalSchema,
  preferencesSchema,
  privacySettingsSchema,
  professionalSchema,
  skillsSchema,
  type CandidateSearchFiltersInput,
} from "./schemas";
import { searchCandidates } from "./search";
import { replaceCandidateLanguages, replaceCandidateSkills } from "./skills-service";
import { tasks } from "./tasks";
import { createFileRow, createOrganization, createTestUser, createWorkflow, orgContext, RUN, seedReferenceData, staffContext, type ReferenceData } from "./test-fixtures";
import type { CandidateSession, CandidateViewer } from "./types";
import { getCandidateView } from "./viewer";

const privacyDefaults = privacySettingsSchema.parse({ showContactToUnlockedOnly: "on" });

async function queuedNotifications(event: string, userId: string): Promise<number> {
  const rows = await db
    .select({ id: backgroundJobs.id })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, "notifications.dispatch"), sql`${backgroundJobs.payload}->>'event' = ${event}`, sql`${backgroundJobs.payload}->'recipients' @> ${JSON.stringify([{ userId }])}::jsonb`));
  return rows.length;
}

describe.skipIf(!env.integration)("candidates module (integration)", () => {
  let ref: ReferenceData;
  let session: CandidateSession;
  let decider: Awaited<ReturnType<typeof staffContext>>;
  let passportDocId = "";
  let passportFileId = "";

  beforeAll(async () => {
    ref = await seedReferenceData();
    const user = await createTestUser({ name: "Ravi Kumar Reddy" });
    session = { user, candidate: await ensureCandidateProfile(user.id) };
    decider = await staffContext("approvals.view", "approvals.decide", "candidates.verify", "candidates.view");
  });

  afterAll(async () => {
    await pool.end();
  });

  const me = () => selfActor(session);
  const refresh = async () => {
    session = { ...session, candidate: (await getCandidateById(session.candidate.id))! };
  };

  it("creates a profile lazily with protective defaults and is idempotent", async () => {
    const c = session.candidate;
    expect(c).toMatchObject({ visibility: "venkat_sai_only", source: "self", verificationLevel: "basic", profileCompleteness: 10 });
    const [privacy] = await db.select().from(candidatePrivacySettings).where(eq(candidatePrivacySettings.candidateId, c.id));
    expect(privacy).toMatchObject({ showFullNameToEmployers: false, showContactToUnlockedOnly: true, showPhoto: false, allowPartnerSubmissions: false });
    expect((await ensureCandidateProfile(session.user.id)).id).toBe(c.id);
  });

  it("saves profile sections, encrypts the passport number and maintains search text and completeness", async () => {
    await updateProfessionalSummary(me(), professionalSchema.parse({ headline: `Pipe welder 6G zz${RUN}`, about: "Eight years of shop and site welding.", experienceLevel: "mid", experienceYears: "6", currentJobTitle: "Welder" }));
    await updatePersonalDetails(
      me(),
      personalSchema.parse({ currentCountryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam", passportStatus: "valid", passportNumber: "K1234567", passportExpiry: "2031-01-01", dateOfBirth: "1994-05-05" }),
    );
    await updateJobPreferences(
      me(),
      preferencesSchema.parse({
        preferredCategoryIds: [ref.weldingCategoryId],
        preferredRoles: ["Pipe welder"],
        desiredEmploymentTypes: ["full_time"],
        availability: "immediate",
        expectedSalaryAmount: "30000",
        expectedSalaryCurrency: "INR",
        expectedSalaryPeriod: "month",
        openToOverseas: "on",
        willingToRelocate: "on",
      }),
    );
    await replaceCandidateSkills(me(), skillsSchema.parse({ skills: [{ skillId: ref.skills.smaw }, { skillId: ref.skills.gtaw, level: "advanced", yearsExperience: 5, isPrimary: true }, { skillId: ref.skills.fcaw }] }));
    await refresh();
    const c = session.candidate;
    expect(c.passportNumberLast4).toBe("4567");
    expect(c.passportNumberEncrypted).not.toContain("K1234567");
    expect(c.passportNumberHash).toBeTruthy();
    expect(c.totalExperienceMonths).toBe(72);
    expect(c.expectedSalaryMinor).toBe(3_000_000);
    expect(c.skillNamesCache[0]).toBe("GTAW");
    expect(c.skillsText).toContain("TIG welding");
    expect(c.preferredRolesText).toContain("Welding and fabrication");
    // headline 5 + location 5 + summary 5 + contact 10 + preferences 15 + skills 15
    expect(c.profileCompleteness).toBe(55);
    const [hit] = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(and(eq(candidateProfiles.id, c.id), sql`${candidateProfiles.searchVector} @@ to_tsquery('simple', 'tig:*')`));
    expect(hit?.id).toBe(c.id);
  });

  it("refreshes profiles in the background after a skill's synonyms change", async () => {
    await db.update(skills).set({ synonyms: ["Stick welding", `manual metal arc ${RUN}`] }).where(eq(skills.id, ref.skills.smaw));
    try {
      await tasks["candidates.refresh_skill"]!({ skillId: ref.skills.smaw }, { taskId: 0, attempt: 1, log: () => undefined });
      expect((await getCandidateById(session.candidate.id))?.skillsText).toContain(`manual metal arc ${RUN}`);
    } finally {
      await db.update(skills).set({ synonyms: ["Stick welding"] }).where(eq(skills.id, ref.skills.smaw));
      await tasks["candidates.refresh_skill"]!({ skillId: ref.skills.smaw }, { taskId: 0, attempt: 1, log: () => undefined });
    }
  });

  it("refreshes only the skill caches on request, in the same format as the full refresh", async () => {
    const full = await getCandidateById(session.candidate.id);
    await db.update(candidateProfiles).set({ skillNamesCache: [], skillsText: null }).where(eq(candidateProfiles.id, session.candidate.id));
    const caches = await refreshSkillCaches(session.candidate.id);
    expect(caches).toEqual({ skillNamesCache: full!.skillNamesCache, skillsText: full!.skillsText });
    expect(await getCandidateById(session.candidate.id)).toMatchObject(caches);
  });

  it("recomputes completeness on history and language changes", async () => {
    await saveEducation(me(), educationSchema.parse({ institutionName: "Government ITI, Visakhapatnam", educationLevelId: ref.education.iti, qualification: "Welder (NCVT)" }));
    await saveExperience(me(), experienceSchema.parse({ employerName: "Shipyard Ltd", jobTitle: "Welder", startDate: "2019-01", isCurrent: "on", jobCategoryId: ref.weldingCategoryId }));
    await replaceCandidateLanguages(
      me(),
      languagesSchema.parse({ languages: [{ languageCode: "te", proficiency: "native", canRead: true, canWrite: true, canSpeak: true }, { languageCode: "en", proficiency: "fluent" }] }),
    );
    await refresh();
    expect(session.candidate.profileCompleteness).toBe(85);
    const detail = await getCandidateProfileDetail(me());
    expect(detail?.completeness.nextActions.slice(0, 2).map((a) => a.key)).toEqual(["upload_resume", "add_photo"]);
    expect(detail?.suggestedExperienceMonths).toBeGreaterThan(80);
  });

  it("refuses overseas work for minors", async () => {
    const minorUser = await createTestUser({ name: "Young Learner" });
    const minor = { user: minorUser, candidate: await ensureCandidateProfile(minorUser.id) };
    await updatePersonalDetails(selfActor(minor), personalSchema.parse({ dateOfBirth: "2012-03-01" }));
    const attempt = updateJobPreferences(selfActor({ ...minor, candidate: (await getCandidateById(minor.candidate.id))! }), preferencesSchema.parse({ openToOverseas: "on" }));
    await expect(attempt).rejects.toMatchObject({ code: "minor_overseas" });
  });

  it("verifies documents through the approval centre and recomputes the verification level", async () => {
    const file = await createFileRow(session.user.id, "candidate_document", { name: "passport.pdf" });
    passportFileId = file.id;
    const doc = await saveCandidateDocument(me(), documentSchema.parse({ documentType: "passport", fileId: file.id, documentNumber: "k 1234567", issuingCountryCode: "IN", isShareableWithEmployers: "on" }));
    passportDocId = doc.id;
    expect(doc).toMatchObject({ documentNumberLast4: "4567", verificationStatus: "unverified" });
    const submitted = await submitDocumentForVerification(me(), doc.id);
    const [request] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, submitted.approvalId));
    expect(request).toMatchObject({ type: "candidate_document", entityId: doc.id, status: "pending", submittedByUserId: session.user.id });
    expect(request?.payload).toMatchObject({ documentType: "passport", numberLast4: "4567" });
    expect(JSON.stringify(request?.payload)).not.toContain("K1234567");

    await decideApproval({ requestId: submitted.approvalId, decision: "approved", reason: null, ctx: decider });
    const [after] = await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, doc.id));
    expect(after).toMatchObject({ verificationStatus: "verified", verifiedByUserId: decider.user.id, rejectionReason: null });
    await refresh();
    expect(session.candidate.verificationLevel).toBe("documents_verified");
    // The candidate submitted it: approval.decided is their notification, no duplicate.
    expect(await queuedNotifications("candidate.verification_updated", session.user.id)).toBe(0);
  });

  it("applies changes requested and rejection decisions with the reviewer's reason", async () => {
    const file = await createFileRow(session.user.id, "candidate_document");
    const doc = await saveCandidateDocument(me(), documentSchema.parse({ documentType: "id_proof", fileId: file.id }));
    const first = await submitDocumentForVerification(me(), doc.id);
    await decideApproval({ requestId: first.approvalId, decision: "changes_requested", reason: "The photo is blurred", ctx: decider });
    let [row] = await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, doc.id));
    expect(row).toMatchObject({ verificationStatus: "unverified", rejectionReason: "The photo is blurred" });

    const second = await submitDocumentForVerification(me(), doc.id);
    expect(second.approvalId).toBe(first.approvalId);
    await decideApproval({ requestId: second.approvalId, decision: "rejected", reason: "The name does not match", ctx: decider });
    [row] = await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, doc.id));
    expect(row).toMatchObject({ verificationStatus: "rejected", rejectionReason: "The name does not match" });
  });

  it("cancels the open review when a document is deleted", async () => {
    const file = await createFileRow(session.user.id, "candidate_document");
    const doc = await saveCandidateDocument(me(), documentSchema.parse({ documentType: "address_proof", fileId: file.id }));
    const submitted = await submitDocumentForVerification(me(), doc.id);
    await deleteCandidateDocument(me(), doc.id);
    const [request] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, submitted.approvalId));
    expect(request?.status).toBe("cancelled");
    await expect(decideApproval({ requestId: submitted.approvalId, decision: "approved", reason: null, ctx: decider })).rejects.toBeInstanceOf(ActionError);
  });

  it("lets staff upload on the candidate's behalf, grants the candidate the file and notifies them of the decision", async () => {
    const editor = await staffContext("candidates.manage", "candidates.view");
    const file = await createFileRow(editor.user.id, "candidate_document", { name: "visa.pdf" });
    const doc = await saveCandidateDocument(staffActor(editor, session.candidate.id), documentSchema.parse({ documentType: "visa", fileId: file.id }));
    const grants = await db.select().from(fileAccessGrants).where(and(eq(fileAccessGrants.fileId, file.id), eq(fileAccessGrants.granteeUserId, session.user.id)));
    expect(grants).toHaveLength(1);
    const submitted = await submitDocumentForVerification(staffActor(editor, session.candidate.id), doc.id);
    await decideApproval({ requestId: submitted.approvalId, decision: "approved", reason: null, ctx: decider });
    expect(await queuedNotifications("candidate.verification_updated", session.user.id)).toBe(1);
  });

  it("verifies the skills a credential evidences together with the credential", async () => {
    const file = await createFileRow(session.user.id, "candidate_credential");
    const credential = await saveCandidateCredential(
      me(),
      credentialSchema.parse({ credentialType: "certificate", name: "Welder qualification test record", issuer: "Third-party inspection body", issuerType: "accredited_external", fileId: file.id, linkedSkillIds: [ref.skills.gtaw] }),
    );
    const skill = async () => (await db.select().from(candidateSkills).where(and(eq(candidateSkills.candidateId, session.candidate.id), eq(candidateSkills.skillId, ref.skills.gtaw))))[0];
    expect(await skill()).toMatchObject({ source: "credential", credentialId: credential.id, verified: false });
    const submitted = await submitCredentialForVerification(me(), credential.id);
    await decideApproval({ requestId: submitted.approvalId, decision: "approved", reason: null, ctx: decider });
    expect(await skill()).toMatchObject({ verified: true });
  });

  describe("privacy-aware views", () => {
    let employerOrg: Awaited<ReturnType<typeof createOrganization>>;

    beforeAll(async () => {
      await updateVisibility(me(), { visibility: "public_to_employers", isOpenToWork: true });
      await refresh();
      employerOrg = await createOrganization("employer");
    });

    it("records the discoverability consent", async () => {
      const [consent] = await db
        .select()
        .from(consentRecords)
        .where(and(eq(consentRecords.userId, session.user.id), eq(consentRecords.purpose, "profile_discoverable")));
      expect(consent?.granted).toBe(true);
    });

    it("shows the candidate everything", async () => {
      const view = await getCandidateView(session.candidate.id, { kind: "self", user: session.user, candidate: session.candidate });
      expect(view?.contact).toMatchObject({ state: "full", email: session.user.email });
      expect(view?.identity).toMatchObject({ dateOfBirth: "1994-05-05", passportNumberLast4: "4567" });
      expect(view?.documents.length).toBeGreaterThanOrEqual(3);
    });

    it("masks staff views by permission and logs contact reveals", async () => {
      const basic = await getCandidateView(session.candidate.id, { kind: "staff", ctx: await staffContext("candidates.view") });
      expect(basic?.contact).toEqual({ state: "hidden", reason: "permission_required" });
      expect(basic?.documents).toEqual([]);
      expect(basic?.identity).toBeNull();
      expect(basic?.internal).not.toBeNull();

      const revealer = await staffContext("candidates.view", "candidates.view_contact");
      const masked = await getCandidateView(session.candidate.id, { kind: "staff", ctx: revealer });
      expect(masked?.contact.state).toBe("masked");
      const revealed = await getCandidateView(session.candidate.id, { kind: "staff", ctx: revealer }, { revealContact: true, reason: "Arranging a trade test" });
      expect(revealed?.contact).toMatchObject({ state: "full", email: session.user.email });
      const logs = await db.select().from(dataAccessLogs).where(and(eq(dataAccessLogs.actorUserId, revealer.user.id), eq(dataAccessLogs.subjectId, session.candidate.id)));
      expect(logs.map((l) => `${l.dataCategory}:${l.accessType}`)).toContain("contact:reveal");
    });

    it("gives discovering employers a masked profile without contact or documents", async () => {
      const ctx = await orgContext("employer", employerOrg, ["employer.candidates.search"]);
      const view = await getCandidateView(session.candidate.id, { kind: "employer", ctx });
      expect(view?.name).toEqual({ display: "R. R.", full: null, masked: true });
      expect(view?.contact).toEqual({ state: "hidden", reason: "unlock_or_application_required" });
      expect(view?.documents).toEqual([]);
      expect(view?.resume).toBeNull();
      expect(view?.identity).toBeNull();
      expect(view?.internal).toBeNull();
      expect(view?.assessments).toEqual([]);
    });

    it("opens contact (on reveal) and shareable documents after an unlock, with file grants for the organisation", async () => {
      const org = await createOrganization("employer");
      const ctx = await orgContext("employer", org, ["employer.candidates.search", "employer.candidates.unlock"]);
      await db.insert(profileUnlocks).values({ organizationId: org.id, candidateId: session.candidate.id, unlockedByUserId: ctx.user.id, expiresAt: new Date(Date.now() + 86_400_000) });
      const view = await getCandidateView(session.candidate.id, { kind: "employer", ctx }, { revealContact: true });
      expect(view?.name.masked).toBe(false);
      expect(view?.contact).toMatchObject({ state: "full", email: session.user.email });
      // Only the shareable, non-rejected passport — never the rejected ID proof or the private visa.
      expect(view?.documents.map((d) => d.id)).toEqual([passportDocId]);
      expect(view?.documents[0]?.numberLast4).toBeNull();
      const grants = await db.select().from(fileAccessGrants).where(and(eq(fileAccessGrants.granteeOrganizationId, org.id), eq(fileAccessGrants.fileId, passportFileId)));
      expect(grants.filter((g) => !g.revokedAt)).toHaveLength(1);
      const logs = await db.select().from(dataAccessLogs).where(and(eq(dataAccessLogs.actorOrganizationId, org.id), eq(dataAccessLogs.subjectId, session.candidate.id)));
      expect(logs.map((l) => l.dataCategory)).toEqual(expect.arrayContaining(["contact", "profile"]));
    });

    it("lets an application shared with consent open the profile even when it is hidden", async () => {
      const org = await createOrganization("employer");
      const { workflowId, stageId } = await createWorkflow();
      const [job] = await db.insert(jobs).values({ code: `VSG-JOB-T${randomUUID().slice(0, 6)}`, slug: `test-job-${randomUUID()}`, title: "Welder", organizationId: org.id }).returning();
      await db.insert(applications).values({
        code: `VSG-APP-T${randomUUID().slice(0, 6)}`,
        jobId: job!.id,
        candidateId: session.candidate.id,
        workflowId,
        currentStageId: stageId,
        consentToShareAt: new Date(),
        sharedWithEmployerAt: new Date(),
      });
      await updateVisibility(me(), { visibility: "hidden", isOpenToWork: true });
      const pipelineOnly = await orgContext("employer", org, ["employer.pipeline.view"]);
      const view = await getCandidateView(session.candidate.id, { kind: "employer", ctx: pipelineOnly });
      expect(view?.access.relationship.applied).toBe(true);
      expect(view?.contact.state).toBe("masked");
      const stranger = await orgContext("employer", await createOrganization("employer"), ["employer.candidates.search"]);
      expect(await getCandidateView(session.candidate.id, { kind: "employer", ctx: stranger })).toBeNull();
      await updateVisibility(me(), { visibility: "public_to_employers", isOpenToWork: true });
    });

    it("hides the profile completely from blocked organisations and revokes their file access", async () => {
      const org = await createOrganization("employer");
      const ctx = await orgContext("employer", org, ["employer.candidates.search"]);
      await db.insert(profileUnlocks).values({ organizationId: org.id, candidateId: session.candidate.id });
      await getCandidateView(session.candidate.id, { kind: "employer", ctx });
      await updatePrivacySettings(me(), { ...privacyDefaults, blockedOrganizationIds: [org.id] });
      expect(await getCandidateView(session.candidate.id, { kind: "employer", ctx })).toBeNull();
      const active = await db.select().from(fileAccessGrants).where(and(eq(fileAccessGrants.granteeOrganizationId, org.id), sql`${fileAccessGrants.revokedAt} is null`));
      expect(active).toEqual([]);
      // Blocking also revokes the organisation's contact unlock (recruitment module).
      const [unlock] = await db.select().from(profileUnlocks).where(and(eq(profileUnlocks.organizationId, org.id), eq(profileUnlocks.candidateId, session.candidate.id)));
      expect(unlock).toMatchObject({ revokedReason: "Candidate blocked the organisation" });
      expect(unlock!.revokedAt).toBeInstanceOf(Date);
      await updatePrivacySettings(me(), privacyDefaults);
    });

    it("shows verified_employers profiles only to verified organisations", async () => {
      await updateVisibility(me(), { visibility: "verified_employers", isOpenToWork: true });
      const pending = await orgContext("employer", await createOrganization("employer", { status: "pending" }), ["employer.candidates.search"]);
      const verified = await orgContext("employer", employerOrg, ["employer.candidates.search"]);
      expect(await getCandidateView(session.candidate.id, { kind: "employer", ctx: pending })).toBeNull();
      expect(await getCandidateView(session.candidate.id, { kind: "employer", ctx: verified })).not.toBeNull();
      await updateVisibility(me(), { visibility: "public_to_employers", isOpenToWork: true });
    });

    it("lets only the sourcing partner see the profile", async () => {
      const partnerOrg = await createOrganization("recruitment_partner");
      await db.insert(candidateAttributions).values({ candidateId: session.candidate.id, partnerOrganizationId: partnerOrg.id, firstSubmittedAt: new Date() });
      const partner: CandidateViewer = { kind: "partner", ctx: await orgContext("recruitment_partner", partnerOrg, ["partner.submissions.view"]) };
      const view = await getCandidateView(session.candidate.id, partner);
      expect(view?.access.relationship.sourced).toBe(true);
      expect(view?.documents).toEqual([]);
      const other: CandidateViewer = { kind: "partner", ctx: await orgContext("recruitment_partner", await createOrganization("recruitment_partner"), ["partner.submissions.view"]) };
      expect(await getCandidateView(session.candidate.id, other)).toBeNull();
    });
  });

  describe("searchCandidates", () => {
    const token = `qq${RUN}`;
    const ids: Record<string, string> = {};

    async function makeCandidate(key: string, opts: {
      visibility?: "public_to_employers" | "verified_employers" | "venkat_sai_only" | "hidden";
      openToWork?: boolean;
      skills?: string[];
      years?: number;
      city?: string;
      country?: string;
      overseas?: boolean;
      dob?: string;
      salary?: [string, string];
      languages?: { languageCode: string; proficiency: "basic" | "conversational" | "fluent" | "native" }[];
      showName?: boolean;
    }) {
      const user = await createTestUser({ name: `Candidate ${key.toUpperCase()} Test` });
      const s: CandidateSession = { user, candidate: await ensureCandidateProfile(user.id) };
      const actor = selfActor(s);
      await updateProfessionalSummary(actor, professionalSchema.parse({ headline: `Fabricator ${token}`, experienceYears: String(opts.years ?? 3) }));
      await updatePersonalDetails(actor, personalSchema.parse({ currentCountryCode: opts.country ?? "IN", city: opts.city ?? "Visakhapatnam", dateOfBirth: opts.dob ?? "1990-01-01" }));
      const fresh = { ...s, candidate: (await getCandidateById(s.candidate.id))! };
      await updateJobPreferences(
        selfActor(fresh),
        preferencesSchema.parse({
          openToOverseas: opts.overseas && !opts.dob?.startsWith("2012") ? "on" : undefined,
          ...(opts.salary ? { expectedSalaryAmount: opts.salary[0], expectedSalaryCurrency: opts.salary[1], expectedSalaryPeriod: "month" } : {}),
        }),
      );
      if (opts.overseas && opts.dob?.startsWith("2012")) {
        // A profile that recorded overseas openness before its date of birth was added.
        await db.update(candidateProfiles).set({ openToOverseas: true }).where(eq(candidateProfiles.id, s.candidate.id));
      }
      if (opts.skills?.length) await replaceCandidateSkills(actor, skillsSchema.parse({ skills: opts.skills.map((skillId) => ({ skillId })) }));
      if (opts.languages?.length) await replaceCandidateLanguages(actor, languagesSchema.parse({ languages: opts.languages }));
      if (opts.showName) await updatePrivacySettings(actor, { ...privacyDefaults, showFullNameToEmployers: true });
      await updateVisibility(actor, { visibility: opts.visibility ?? "public_to_employers", isOpenToWork: opts.openToWork ?? true });
      ids[key] = s.candidate.id;
      return s;
    }

    let verifiedEmployer: CandidateViewer;
    let pendingEmployer: CandidateViewer;
    let staffViewer: CandidateViewer;
    let managerViewer: CandidateViewer;

    const run = async (viewer: CandidateViewer, filters: CandidateSearchFiltersInput = {}) =>
      (await searchCandidates(candidateSearchFiltersSchema.parse({ q: token, pageSize: 50, ...filters }), viewer)).items.map((i) => i.candidateId);

    beforeAll(async () => {
      const a = await makeCandidate("a", { skills: [ref.skills.gtaw, ref.skills.smaw], years: 6, city: "Visakhapatnam", overseas: true, salary: ["30000", "INR"], languages: [{ languageCode: "en", proficiency: "fluent" }], showName: true });
      await makeCandidate("b", { skills: [ref.skills.gtaw], years: 2, city: "Chennai", salary: ["50000", "INR"], languages: [{ languageCode: "en", proficiency: "basic" }] });
      await makeCandidate("c", { visibility: "verified_employers", skills: [ref.skills.tally], years: 10, salary: ["4000", "AED"] });
      await makeCandidate("d", { visibility: "venkat_sai_only", skills: [ref.skills.gtaw] });
      await makeCandidate("e", { visibility: "hidden", skills: [ref.skills.gtaw] });
      await makeCandidate("f", { openToWork: false });
      await makeCandidate("minor", { overseas: true, dob: "2012-06-01", skills: [ref.skills.gtaw] });

      // Candidate A: verified credential, passed (published) assessment, consent to share results.
      await db.insert(skillAssessments).values({
        code: `VSG-ASM-T${RUN}a`,
        candidateId: ids.a!,
        trade: "Pipe welder",
        skillId: ref.skills.gtaw,
        scheduledAt: new Date(),
        status: "completed",
        result: "pass",
        completedAt: new Date(),
        resultPublishedAt: new Date(),
        standardReference: "WPS-001",
      });
      await updateCandidateConsents(selfActor({ user: a.user, candidate: (await getCandidateById(ids.a!))! }), { shareAssessmentResults: true, contactReferences: false });
      // Candidate B: passed assessment without consent to share it with employers.
      await db.insert(skillAssessments).values({
        code: `VSG-ASM-T${RUN}b`,
        candidateId: ids.b!,
        trade: "Fabricator",
        scheduledAt: new Date(),
        status: "completed",
        result: "pass",
        completedAt: new Date(),
        resultPublishedAt: new Date(),
      });
      await db.insert(candidateDocuments).values({ candidateId: ids.a!, documentType: "education_certificate", fileId: (await createFileRow(a.user.id, "candidate_document")).id });

      verifiedEmployer = { kind: "employer", ctx: await orgContext("employer", await createOrganization("employer"), ["employer.candidates.search"]) };
      pendingEmployer = { kind: "employer", ctx: await orgContext("employer", await createOrganization("employer", { status: "pending" }), ["employer.candidates.search"]) };
      staffViewer = { kind: "staff", ctx: await staffContext("candidates.view") };
      managerViewer = { kind: "staff", ctx: await staffContext("candidates.view", "candidates.manage") };
    });

    it("applies visibility per viewer", async () => {
      expect((await run(verifiedEmployer)).sort()).toEqual([ids.a, ids.b, ids.c].sort());
      expect((await run(pendingEmployer)).sort()).toEqual([ids.a, ids.b].sort());
      expect((await run(staffViewer)).sort()).toEqual([ids.a, ids.b, ids.c, ids.d, ids.f, ids.minor].sort());
      expect(await run(staffViewer, { includeHidden: "on" })).not.toContain(ids.e);
      expect(await run(managerViewer, { includeHidden: "on" })).toContain(ids.e);
    });

    it("masks names for employers unless the candidate shows them", async () => {
      const result = await searchCandidates(candidateSearchFiltersSchema.parse({ q: token, pageSize: 50 }), verifiedEmployer);
      const a = result.items.find((i) => i.candidateId === ids.a)!;
      const b = result.items.find((i) => i.candidateId === ids.b)!;
      expect(a).toMatchObject({ displayName: "Candidate A Test", nameMasked: false });
      expect(b).toMatchObject({ displayName: "C. T.", nameMasked: true, visibility: null });
      expect(result.total).toBe(result.items.length);
    });

    it("filters by skills (any / all), experience and location", async () => {
      expect((await run(staffViewer, { skillIds: [ref.skills.gtaw, ref.skills.smaw] })).sort()).toEqual([ids.a, ids.b, ids.d, ids.minor].sort());
      expect(await run(staffViewer, { skillIds: [ref.skills.gtaw, ref.skills.smaw], skillMatch: "all" })).toEqual([ids.a]);
      expect((await run(staffViewer, { experienceMinYears: "5" })).sort()).toEqual([ids.a, ids.c].sort());
      expect(await run(staffViewer, { experienceMinYears: "1", experienceMaxYears: "2" })).toEqual([ids.b]);
      expect(await run(staffViewer, { city: "chenn" })).toEqual([ids.b]);
    });

    it("filters by language level and salary within the same currency", async () => {
      expect(await run(staffViewer, { languageCodes: ["en"], minLanguageProficiency: "conversational" })).toEqual([ids.a]);
      const withinBudget = await run(staffViewer, { salaryMax: "40000", salaryCurrency: "INR", salaryPeriod: "month" });
      expect(withinBudget).toContain(ids.a);
      expect(withinBudget).not.toContain(ids.b);
      expect(withinBudget).not.toContain(ids.c);
      expect(withinBudget).toContain(ids.d);
    });

    it("excludes minors from overseas searches", async () => {
      expect(await run(staffViewer, { openToOverseas: "on" })).toEqual([ids.a]);
      expect(await run(staffViewer, { forOverseasRole: "on", skillIds: [ref.skills.gtaw] })).not.toContain(ids.minor);
      const foreignEmployer: CandidateViewer = { kind: "employer", ctx: await orgContext("employer", await createOrganization("employer", { countryCode: "QA" }), ["employer.candidates.search"]) };
      expect(await run(staffViewer, { skillIds: [ref.skills.gtaw] })).toContain(ids.minor);
      expect(await run(foreignEmployer, { skillIds: [ref.skills.gtaw] })).not.toContain(ids.minor);
    });

    it("filters by verified credentials and passed assessments, honouring the sharing consent for employers", async () => {
      expect(await run(staffViewer, { assessedOnly: "on" })).toEqual(expect.arrayContaining([ids.a, ids.b]));
      expect(await run(verifiedEmployer, { assessedOnly: "on" })).toEqual([ids.a]);
      const cards = await searchCandidates(candidateSearchFiltersSchema.parse({ q: token, pageSize: 50 }), verifiedEmployer);
      expect(cards.items.find((c) => c.candidateId === ids.b)?.passedAssessmentCount).toBe(0);
      expect(cards.items.find((c) => c.candidateId === ids.a)?.passedAssessmentCount).toBe(1);
    });

    it("refuses viewers without the search permission", async () => {
      const noPermission: CandidateViewer = { kind: "employer", ctx: await orgContext("employer", await createOrganization("employer"), ["employer.pipeline.view"]) };
      await expect(searchCandidates(candidateSearchFiltersSchema.parse({}), noPermission)).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  it("builds a complete data export for the candidate", async () => {
    await refresh();
    const exported = await buildCandidateDataExport({ kind: "self", session });
    expect(exported.formatVersion).toBe(1);
    expect(exported.profile).toMatchObject({ passportNumber: "K1234567", dateOfBirth: "1994-05-05" });
    expect(exported.skills.length).toBe(3);
    expect(exported.documents.length).toBeGreaterThanOrEqual(3);
    expect(exported.consents.map((c) => c.purpose)).toContain("profile_discoverable");
    expect(exported.files.length).toBeGreaterThan(0);
  });
});
