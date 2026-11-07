import "server-only";

import { and, eq, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { applications, candidateProfiles, partnerAssignments, partnerSubmissions, users } from "@/db/schema";
import { selfActor, ensureCandidateProfile, updatePersonalDetails, updateProfessionalSummary } from "@/modules/candidates/service";
import { personalSchema, professionalSchema } from "@/modules/candidates/schemas";
import type { CandidateProfileRow } from "@/modules/candidates/types";
import { getConsentState, recordConsent } from "@/modules/identity/consent";
import type { StaffContext } from "@/modules/identity/authz";
import { asCandidate } from "@/modules/recruitment/actors";
import { createApplication } from "@/modules/recruitment/applications";
import { createPartnerAssignment } from "@/modules/recruitment/partner-assignments";
import { submitCandidateByPartner } from "@/modules/recruitment/partner-submissions";
import { setSetting } from "@/modules/settings";

import { seedAdminOpsQa } from "./e2e-admin-ops";
import { ensureCmsContent, ensureEmployerPlans, ensureSellerDetails } from "./e2e-content";
import { seedEmployerQa } from "./e2e-employer";
import { seedPartnerInstitutionQa } from "./e2e-partner-institution";
import { seedPublicQa } from "./e2e-public";
import { seedTalentQa } from "./e2e-talent";
import {
  dateOfBirthForAge,
  e2eEmail,
  ensureMember,
  generatePassword,
  isoDay,
  loadSessionUser,
  orgContextFor,
  removeFreshAccount,
  setStaffRole,
  superAdminContext,
  upsertPasswordUser,
  type SeedLog,
} from "./e2e-helpers";
import {
  ensureConfirmedEnrolment,
  ensureCourseWithOpenBatch,
  ensureInstitution,
  ensureOrganization,
  ensurePartner,
  ensurePartnerAgreement,
  ensurePublishedJob,
  ensureRecruitingAgent,
  ensureVerified,
} from "./e2e-orgs";

/**
 * LOCAL-ONLY end-to-end seed (`npm run db:seed:e2e`, runner: scripts/seed-e2e.ts). Builds clearly labelled
 * test accounts and data for the Playwright specs through the domain services. The runner refuses anything
 * but a local database (./e2e-guard.ts); this file is never imported by the production seed or by app code.
 *
 * Idempotent: persistent accounts and their data are found by natural key and reset to a known state;
 * "fresh" accounts (consumed by onboarding / age-gate specs) are deleted and recreated on every run.
 */

type AccountSpec = { local: string; name: string; staffRole?: string; fresh?: boolean };

/** Env prefix (E2E_<KEY>_EMAIL / _PASSWORD) → account. */
export const E2E_ACCOUNTS = {
  ADMIN: { local: "super-admin", name: "E2E Super Admin", staffRole: "super_admin" },
  OPS: { local: "ops-admin", name: "E2E Operations Admin", staffRole: "operations_manager" },
  FINANCE: { local: "finance-admin", name: "E2E Finance Admin", staffRole: "finance" },
  CONTENT: { local: "content-admin", name: "E2E Content Admin", staffRole: "content_manager" },
  EMPLOYER: { local: "employer-owner", name: "E2E Employer Owner" },
  EMPLOYER_MEMBER: { local: "employer-member", name: "E2E Employer Member" },
  PARTNER: { local: "partner-owner", name: "E2E Partner Owner" },
  OTHER_PARTNER: { local: "other-partner-owner", name: "E2E Other Partner Owner" },
  INSTITUTION: { local: "institution-owner", name: "E2E Institution Owner" },
  OTHER_INSTITUTION: { local: "other-institution-owner", name: "E2E Other Institution Owner" },
  CANDIDATE: { local: "candidate", name: "E2E Candidate" },
  MINOR: { local: "minor-candidate", name: "E2E Minor Candidate" },
  NEW_USER: { local: "new-user", name: "E2E New User", fresh: true },
  NEW_CANDIDATE: { local: "new-candidate", name: "E2E New Candidate", fresh: true },
  NEW_PARTNER: { local: "new-partner", name: "E2E New Partner", fresh: true },
} as const satisfies Record<string, AccountSpec>;

export type E2eAccountKey = keyof typeof E2E_ACCOUNTS;

export type E2eSeedOptions = {
  /** Passwords from the previous env file (E2E_<KEY>_PASSWORD) to keep for persistent accounts. */
  keptPasswords?: Readonly<Record<string, string>>;
  log?: SeedLog;
};

export type E2eSeedResult = { env: Record<string, string> };

const ONBOARDING_STEPS = ["goals", "basics", "skills", "availability", "resume", "visibility"] as const;

async function markOnboardingFinished(userId: string): Promise<void> {
  const [row] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  const current = (row?.preferences as Record<string, unknown> | undefined)?.talentOnboarding as { finishedAt?: string | null } | undefined;
  if (current?.finishedAt) return;
  const value = JSON.stringify({ talentOnboarding: { goals: ["job", "training"], completed: [...ONBOARDING_STEPS], skipped: [], finishedAt: new Date().toISOString() } });
  await db
    .update(users)
    .set({ preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${value}::jsonb` })
    .where(eq(users.id, userId));
}

/** Candidate profile with a date of birth (locked once recorded) and profile basics. */
async function ensureCandidate(userId: string, opts: { age: number; headline?: string }): Promise<CandidateProfileRow> {
  let profile = await ensureCandidateProfile(userId);
  const session = async () => ({ user: await loadSessionUser(userId), candidate: profile });
  if (!profile.dateOfBirth) {
    profile = await updatePersonalDetails(
      selfActor(await session()),
      personalSchema.parse({ legalName: (await loadSessionUser(userId)).displayName, dateOfBirth: dateOfBirthForAge(opts.age), nationalityCode: "IN", currentCountryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam" }),
    );
  }
  if (opts.headline && !profile.headline) {
    profile = await updateProfessionalSummary(
      selfActor(await session()),
      professionalSchema.parse({ headline: opts.headline, about: "Test candidate used by automated end-to-end tests.", experienceLevel: "mid", experienceYears: 6, currentJobTitle: "Welder (test)" }),
    );
  }
  return profile;
}

/** Minor without guardian consent: withdraw any consent a previous spec run recorded (the ledger is append-only). */
async function resetGuardianConsent(userId: string): Promise<void> {
  const state = await getConsentState(userId, ["guardian_consent"]);
  if (state.guardian_consent?.granted) {
    await recordConsent({ userId, purpose: "guardian_consent", granted: false, source: "admin", evidence: { reason: "E2E seed reset" } });
  }
}

async function ensureAssignment(staff: StaffContext, partnerOrganizationId: string, jobId: string): Promise<string> {
  const [existing] = await db
    .select({ id: partnerAssignments.id })
    .from(partnerAssignments)
    .where(and(eq(partnerAssignments.partnerOrganizationId, partnerOrganizationId), eq(partnerAssignments.jobId, jobId), eq(partnerAssignments.status, "active")))
    .limit(1);
  if (existing) return existing.id;
  const created = await createPartnerAssignment(staff, {
    partnerOrganizationId,
    jobId,
    positionsTarget: 5,
    dueDate: isoDay(30),
    instructions: "E2E test assignment. Submit test candidates only.",
  });
  return created.id;
}

async function ensureSubmission(ownerUserId: string, organizationId: string, assignmentId: string, person: { local: string; name: string }): Promise<string> {
  const [existing] = await db
    .select({ id: partnerSubmissions.id })
    .from(partnerSubmissions)
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, partnerSubmissions.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(eq(partnerSubmissions.assignmentId, assignmentId), eq(users.email, e2eEmail(person.local)), notInArray(partnerSubmissions.status, ["withdrawn"])))
    .limit(1);
  if (existing) return existing.id;
  const ctx = await orgContextFor<"recruitment_partner">(ownerUserId, organizationId);
  const result = await submitCandidateByPartner(ctx, assignmentId, {
    candidate: { kind: "new", fullName: person.name, email: e2eEmail(person.local), dateOfBirth: dateOfBirthForAge(30), currentCountryCode: "IN", city: "Visakhapatnam", headline: "Test candidate (partner submission)" },
    partnerNotes: "E2E test submission.",
    consent: { attested: true, method: "written", capturedOn: isoDay(0) },
  });
  return result.submissionId;
}

async function ensureApplication(candidate: CandidateProfileRow, userId: string, jobId: string): Promise<string> {
  const [existing] = await db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(and(eq(applications.jobId, jobId), eq(applications.candidateId, candidate.id)))
    .limit(1);
  if (existing && existing.status !== "withdrawn") return existing.id;
  const created = await createApplication(asCandidate({ user: { id: userId }, candidate }), {
    jobId,
    coverLetter: "E2E test application.",
    answers: {},
    consentToShare: true,
  });
  return created.id;
}

export async function runE2eSeed(opts: E2eSeedOptions = {}): Promise<E2eSeedResult> {
  const log = opts.log ?? (() => undefined);
  const kept = opts.keptPasswords ?? {};
  const env: Record<string, string> = {};
  const userIds = {} as Record<E2eAccountKey, string>;

  log("Settings:");
  // Staff 2FA off so specs can sign staff in with a password (this local database only).
  await setSetting("security.require_staff_2fa", false, null);
  log("  security.require_staff_2fa = false");

  log("Accounts:");
  for (const [key, spec] of Object.entries(E2E_ACCOUNTS) as [E2eAccountKey, AccountSpec][]) {
    const email = e2eEmail(spec.local);
    if (spec.fresh) await removeFreshAccount(email, log);
    const keptPassword = spec.fresh ? undefined : kept[`E2E_${key}_PASSWORD`];
    const password = keptPassword ?? generatePassword({ email, name: spec.name });
    const { id, created } = await upsertPasswordUser({ email, displayName: spec.name, password, isStaff: !!spec.staffRole }, { passwordChanged: !keptPassword });
    if (spec.staffRole) await setStaffRole(id, spec.staffRole);
    userIds[key] = id;
    env[`E2E_${key}_EMAIL`] = email;
    env[`E2E_${key}_PASSWORD`] = password;
    log(`  ${created ? "created" : "reset"} ${key.toLowerCase()} (${email})`);
  }
  const staff = superAdminContext(await loadSessionUser(userIds.ADMIN));

  log("Candidates:");
  const candidate = await ensureCandidate(userIds.CANDIDATE, { age: 28, headline: "Pipe welder (E2E test)" });
  await markOnboardingFinished(userIds.CANDIDATE);
  const minor = await ensureCandidate(userIds.MINOR, { age: 16 });
  await resetGuardianConsent(userIds.MINOR);
  env.E2E_CANDIDATE_ID = candidate.id;
  env.E2E_MINOR_CANDIDATE_ID = minor.id;
  log(`  adult ${candidate.id}, minor ${minor.id}`);

  log("Employer:");
  let employerOrg = await ensureOrganization("employer", userIds.EMPLOYER, {
    name: "E2E Employer Co",
    legalName: "E2E Employer Co (test organisation)",
    description: "Test employer used by automated end-to-end tests.",
    email: e2eEmail("employer-office"),
    countryCode: "IN",
    stateRegion: "Andhra Pradesh",
    city: "Visakhapatnam",
  });
  employerOrg = await ensureVerified(employerOrg, userIds.EMPLOYER, staff, ["registration_certificate"], log);
  await ensureMember(employerOrg.id, "employer", userIds.EMPLOYER_MEMBER, "hr_manager");
  const employerCtx = await orgContextFor<"employer">(userIds.EMPLOYER, employerOrg.id);
  const domesticJob = await ensurePublishedJob(
    employerCtx,
    staff,
    {
      title: "E2E Structural welder (test job)",
      summary: "Test job used by automated end-to-end tests.",
      descriptionHtml: "<p>Test job. Not a real vacancy.</p>",
      countryCode: "IN",
      stateRegion: "Andhra Pradesh",
      city: "Visakhapatnam",
      employmentType: "full_time",
      workMode: "on_site",
      experienceMinYears: "2",
      experienceMaxYears: "8",
      salaryMin: "25000",
      salaryMax: "35000",
      salaryCurrency: "INR",
      salaryPeriod: "month",
      salaryVisible: "on",
    },
    log,
  );
  const overseasJob = await ensurePublishedJob(
    employerCtx,
    staff,
    {
      title: "E2E Pipe welder overseas (test job)",
      summary: "Test overseas job used by automated end-to-end tests.",
      descriptionHtml: "<p>Test job. Not a real vacancy.</p>",
      countryCode: "AE",
      city: "Abu Dhabi",
      employmentType: "full_time",
      workMode: "on_site",
      experienceMinYears: "3",
      experienceMaxYears: "10",
      salaryMin: "2500",
      salaryMax: "3200",
      salaryCurrency: "AED",
      salaryPeriod: "month",
      salaryVisible: "on",
      accommodationProvided: "yes",
    },
    log,
  );
  env.E2E_EMPLOYER_ORG_ID = employerOrg.id;
  env.E2E_EMPLOYER_VERIFIED = employerOrg.status === "verified" ? "1" : "0";
  env.E2E_EMPLOYER_JOB_ID = domesticJob.id;
  env.E2E_EMPLOYER_JOB_SLUG = domesticJob.slug;
  env.E2E_EMPLOYER_OVERSEAS_JOB_ID = overseasJob.id;
  env.E2E_EMPLOYER_OVERSEAS_JOB_SLUG = overseasJob.slug;

  log("Recruitment partners:");
  const partnerBase = await ensureOrganization("recruitment_partner", userIds.PARTNER, {
    name: "E2E Recruitment Partner",
    legalName: "E2E Recruitment Partner (test organisation)",
    description: "Test recruitment partner used by automated end-to-end tests.",
    email: e2eEmail("partner-office"),
    countryCode: "IN",
    stateRegion: "Andhra Pradesh",
    city: "Visakhapatnam",
  });
  const partner = await ensurePartner({ org: partnerBase, ownerUserId: userIds.PARTNER, staff, overseas: true, licenceNumber: "E2E-TEST-RA-0001", log });
  await ensurePartnerAgreement(partner.org, userIds.PARTNER, staff);
  if (partner.licenceId) await ensureRecruitingAgent(overseasJob, partner.licenceId, staff);
  const assignmentId = await ensureAssignment(staff, partner.org.id, overseasJob.id);
  const submissionId = await ensureSubmission(userIds.PARTNER, partner.org.id, assignmentId, { local: "partner-candidate-1", name: "E2E Partner Candidate One" });

  const otherPartnerBase = await ensureOrganization("recruitment_partner", userIds.OTHER_PARTNER, {
    name: "E2E Other Recruitment Partner",
    description: "Second test recruitment partner (isolation checks).",
    email: e2eEmail("other-partner-office"),
    countryCode: "IN",
    city: "Hyderabad",
  });
  const otherPartner = await ensurePartner({ org: otherPartnerBase, ownerUserId: userIds.OTHER_PARTNER, staff, overseas: false, log });
  await ensurePartnerAgreement(otherPartner.org, userIds.OTHER_PARTNER, staff);
  const otherAssignmentId = await ensureAssignment(staff, otherPartner.org.id, domesticJob.id);
  const otherSubmissionId = await ensureSubmission(userIds.OTHER_PARTNER, otherPartner.org.id, otherAssignmentId, { local: "partner-candidate-2", name: "E2E Partner Candidate Two" });
  env.E2E_PARTNER_ORG_ID = partner.org.id;
  env.E2E_PARTNER_VERIFIED = partner.org.status === "verified" ? "1" : "0";
  env.E2E_PARTNER_ASSIGNMENT_ID = assignmentId;
  env.E2E_PARTNER_SUBMISSION_ID = submissionId;
  env.E2E_OTHER_PARTNER_ORG_ID = otherPartner.org.id;
  env.E2E_OTHER_PARTNER_SUBMISSION_ID = otherSubmissionId;
  log(`  assignments ${assignmentId}, ${otherAssignmentId}`);

  log("Applications:");
  env.E2E_EMPLOYER_APPLICATION_ID = await ensureApplication(candidate, userIds.CANDIDATE, domesticJob.id);
  log(`  ${env.E2E_EMPLOYER_APPLICATION_ID}`);

  log("Institutions:");
  const institutionBase = await ensureOrganization("institution", userIds.INSTITUTION, {
    name: "E2E Training Institute",
    description: "Test institution used by automated end-to-end tests.",
    email: e2eEmail("institution-office"),
    countryCode: "IN",
    stateRegion: "Andhra Pradesh",
    city: "Visakhapatnam",
  });
  const institution = await ensureInstitution({ org: institutionBase, ownerUserId: userIds.INSTITUTION, staff, authoriseIssuer: true, log });
  const course = await ensureCourseWithOpenBatch({ org: institution, ownerUserId: userIds.INSTITUTION, staff, title: "E2E Welding basics (test course)", batchTitle: "E2E Morning batch (test)" });
  await ensureConfirmedEnrolment({ org: institution, ownerUserId: userIds.INSTITUTION, batchId: course.batchId, learner: { userId: userIds.CANDIDATE, candidateId: candidate.id, displayName: E2E_ACCOUNTS.CANDIDATE.name } });
  const otherInstitutionBase = await ensureOrganization("institution", userIds.OTHER_INSTITUTION, {
    name: "E2E Other Training Institute",
    description: "Second test institution (isolation checks).",
    email: e2eEmail("other-institution-office"),
    countryCode: "IN",
    city: "Hyderabad",
  });
  const otherInstitution = await ensureInstitution({ org: otherInstitutionBase, ownerUserId: userIds.OTHER_INSTITUTION, staff, authoriseIssuer: false, log });
  const otherCourse = await ensureCourseWithOpenBatch({ org: otherInstitution, ownerUserId: userIds.OTHER_INSTITUTION, staff, title: "E2E Other welding course (test)", batchTitle: "E2E Other batch (test)" });
  env.E2E_INSTITUTION_ORG_ID = institution.id;
  env.E2E_INSTITUTION_VERIFIED = institution.status === "verified" ? "1" : "0";
  env.E2E_INSTITUTION_COURSE_ID = course.courseId;
  env.E2E_INSTITUTION_BATCH_ID = course.batchId;
  env.E2E_OTHER_INSTITUTION_ORG_ID = otherInstitution.id;
  env.E2E_OTHER_BATCH_ID = otherCourse.batchId;

  log("Commercial:");
  await ensureSellerDetails(userIds.ADMIN);
  const planIds = await ensureEmployerPlans(staff, log);
  env.E2E_PLAN_INR_ID = planIds.e2e_employer_inr!;
  env.E2E_PLAN_OTHER_CURRENCY_ID = planIds.e2e_employer_usd!;
  env.E2E_PLAN_OTHER_CURRENCY = "USD";

  log("Content:");
  await ensureCmsContent(staff, log);

  // ---- Employer Portal QA block (qa:employer): see ./e2e-employer.ts ----
  Object.assign(env, await seedEmployerQa({ staff, employer: employerCtx, keptPasswords: kept, log }));
  // ---- end Employer Portal QA block ----

  // ---- Public website QA block (qa:public): see ./e2e-public.ts ----
  Object.assign(env, await seedPublicQa({ staff, publicOrgIds: [env.E2E_EMPLOYER_ORG_ID!, env.E2E_INSTITUTION_ORG_ID!], log }));
  // ---- end Public website QA block ----

  // ---- People Portal QA block (qa:talent): see ./e2e-talent.ts ----
  Object.assign(env, await seedTalentQa({ staff, employer: employerCtx, keptPasswords: kept, log }));
  // ---- end People Portal QA block ----

  // ---- Partner and Institution QA block (qa:partner-institution): see ./e2e-partner-institution.ts ----
  Object.assign(
    env,
    await seedPartnerInstitutionQa({
      staff,
      partnerOrganizationId: partner.org.id,
      otherPartnerOrganizationId: otherPartner.org.id,
      institution,
      institutionOwnerUserId: userIds.INSTITUTION,
      institutionCourseId: course.courseId,
      otherInstitutionCourseId: otherCourse.courseId,
      keptPasswords: kept,
      log,
    }),
  );
  // ---- end Partner and Institution QA block ----

  // ---- Command Centre operations QA block (qa:admin-ops): see ./e2e-admin-ops.ts ----
  Object.assign(env, await seedAdminOpsQa({ log }));
  // ---- end Command Centre operations QA block ----

  env.E2E_SEEDED_AT = new Date().toISOString();
  return { env };
}
