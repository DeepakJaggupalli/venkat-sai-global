import "server-only";

import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { applications, jobs, requirementRequests } from "@/db/schema";
import { ensureCandidateProfile, selfActor, updatePersonalDetails, updateProfessionalSummary, updateVisibility } from "@/modules/candidates/service";
import { personalSchema, professionalSchema, visibilitySchema } from "@/modules/candidates/schemas";
import type { CandidateProfileRow } from "@/modules/candidates/types";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { createJob } from "@/modules/jobs/job-service";
import { jobFormSchema } from "@/modules/jobs/schemas";
import { employerRequirementSchema } from "@/modules/operations/schemas";
import { submitEmployerRequirement } from "@/modules/operations/requirements";
import { asCandidate } from "@/modules/recruitment/actors";
import { createApplication } from "@/modules/recruitment/applications";
import { revokeUnlocksForCandidate } from "@/modules/recruitment/unlocks";

import { dateOfBirthForAge, e2eEmail, generatePassword, loadSessionUser, orgContextFor, upsertPasswordUser, type SeedLog } from "./e2e-helpers";
import { ensureOrganization, ensurePublishedJob } from "./e2e-orgs";

/**
 * E2E seed block for the Employer Portal specs (ui-employer-workspace, ui-employer-talent). Called from
 * runE2eSeed() after the employer organisation and its jobs exist. Local database only (see e2e-guard.ts).
 *
 *  - Two discoverable adult candidates (visibility "public_to_employers") so candidate search, compare and the
 *    masked-contact / unlock flow have real results. Their unlocks by E2E Employer Co are revoked on every run,
 *    so contact details start hidden again.
 *  - A dedicated published QA job with one application from a separate adult applicant, for interview
 *    scheduling and offer drafting (the shared E2E_EMPLOYER_APPLICATION_ID stays untouched for other specs).
 *  - "E2E Other Employer Co" (not verified) with a draft job and a draft requirement: cross-organisation
 *    isolation checks, and the unverified-employer states (submit blocked, announcements unavailable).
 */

type Person = { local: string; name: string; age: number; headline: string };

const DISCOVERABLE: readonly Person[] = [
  { local: "employer-qa-discoverable-1", name: "E2E Discoverable Candidate One", age: 30, headline: "Pipe welder, TIG and ARC (E2E discoverable test candidate)" },
  { local: "employer-qa-discoverable-2", name: "E2E Discoverable Candidate Two", age: 34, headline: "Structural welder and fitter (E2E discoverable test candidate)" },
];
const APPLICANT: Person = { local: "employer-qa-applicant", name: "E2E Employer QA Applicant", age: 29, headline: "Fabrication welder (E2E applicant test candidate)" };
const QA_JOB_TITLE = "E2E Employer QA job (test job)";
const OTHER_JOB_TITLE = "E2E Other employer draft job (test job)";
const OTHER_REQUIREMENT_TITLE = "E2E Other employer draft requirement (test)";

async function ensureAdultCandidate(person: Person): Promise<{ userId: string; profile: CandidateProfileRow }> {
  const email = e2eEmail(person.local);
  // Nobody signs in as these people; the password is random and never written to the env file.
  const { id: userId } = await upsertPasswordUser({ email, displayName: person.name, password: generatePassword({ email, name: person.name }) }, { passwordChanged: false });
  let profile = await ensureCandidateProfile(userId);
  const session = async () => ({ user: await loadSessionUser(userId), candidate: profile });
  if (!profile.dateOfBirth) {
    profile = await updatePersonalDetails(
      selfActor(await session()),
      personalSchema.parse({ legalName: person.name, dateOfBirth: dateOfBirthForAge(person.age), nationalityCode: "IN", currentCountryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam" }),
    );
  }
  if (!profile.headline) {
    profile = await updateProfessionalSummary(
      selfActor(await session()),
      professionalSchema.parse({ headline: person.headline, about: "Test candidate used by automated end-to-end tests.", experienceLevel: "mid", experienceYears: 7, currentJobTitle: "Welder (test)" }),
    );
  }
  return { userId, profile };
}

export async function seedEmployerQa(opts: {
  staff: StaffContext;
  employer: OrgContext<"employer">;
  keptPasswords: Readonly<Record<string, string>>;
  log: SeedLog;
}): Promise<Record<string, string>> {
  const { staff, employer, log } = opts;
  const env: Record<string, string> = {};

  log("Employer QA:");
  // Discoverable candidates, contact hidden again for E2E Employer Co.
  const discoverableIds: string[] = [];
  for (const person of DISCOVERABLE) {
    const { userId, profile } = await ensureAdultCandidate(person);
    let current = profile;
    if (current.visibility !== "public_to_employers" || !current.isOpenToWork) {
      current = await updateVisibility(selfActor({ user: await loadSessionUser(userId), candidate: current }), visibilitySchema.parse({ visibility: "public_to_employers", isOpenToWork: "true" }));
    }
    await revokeUnlocksForCandidate(current.id, { organizationIds: [employer.organization.id], reason: "E2E seed reset", actorUserId: staff.user.id });
    discoverableIds.push(current.id);
  }
  env.E2E_DISCOVERABLE_CANDIDATE_IDS = discoverableIds.join(",");
  log(`  discoverable candidates ${discoverableIds.join(", ")}`);

  // QA job + application for interview and offer flows.
  const qaJob = await ensurePublishedJob(
    employer,
    staff,
    {
      title: QA_JOB_TITLE,
      summary: "Test job for employer interview and offer checks. Not a real vacancy.",
      descriptionHtml: "<p>Test job. Not a real vacancy.</p>",
      countryCode: "IN",
      stateRegion: "Andhra Pradesh",
      city: "Visakhapatnam",
      employmentType: "full_time",
      workMode: "on_site",
      salaryMin: "28000",
      salaryMax: "36000",
      salaryCurrency: "INR",
      salaryPeriod: "month",
      salaryVisible: "on",
    },
    log,
  );
  const applicant = await ensureAdultCandidate(APPLICANT);
  const [existingApplication] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.jobId, qaJob.id), eq(applications.candidateId, applicant.profile.id), ne(applications.status, "withdrawn")))
    .limit(1);
  const qaApplicationId =
    existingApplication?.id ??
    (await createApplication(asCandidate({ user: { id: applicant.userId }, candidate: applicant.profile }), { jobId: qaJob.id, coverLetter: "E2E test application.", answers: {}, consentToShare: true })).id;
  env.E2E_EMPLOYER_QA_JOB_ID = qaJob.id;
  env.E2E_EMPLOYER_QA_APPLICATION_ID = qaApplicationId;
  log(`  QA application ${qaApplicationId}`);

  // A second, unverified employer with its own draft records.
  const otherEmail = e2eEmail("other-employer-owner");
  const otherName = "E2E Other Employer Owner";
  const keptPassword = opts.keptPasswords.E2E_OTHER_EMPLOYER_PASSWORD;
  const otherPassword = keptPassword ?? generatePassword({ email: otherEmail, name: otherName });
  const { id: otherOwnerId } = await upsertPasswordUser({ email: otherEmail, displayName: otherName, password: otherPassword }, { passwordChanged: !keptPassword });
  const otherOrg = await ensureOrganization("employer", otherOwnerId, {
    name: "E2E Other Employer Co",
    description: "Second test employer (isolation checks). Not verified.",
    email: e2eEmail("other-employer-office"),
    countryCode: "IN",
    city: "Hyderabad",
  });
  const otherCtx = await orgContextFor<"employer">(otherOwnerId, otherOrg.id);
  const [existingJob] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.organizationId, otherOrg.id), eq(jobs.title, OTHER_JOB_TITLE), isNull(jobs.deletedAt)))
    .limit(1);
  const otherJobId =
    existingJob?.id ??
    (await createJob({ kind: "employer", ctx: otherCtx }, jobFormSchema.parse({ title: OTHER_JOB_TITLE, summary: "Draft test job (isolation checks).", countryCode: "IN", city: "Hyderabad", employmentType: "full_time", workMode: "on_site" }))).id;
  const [existingRequirement] = await db
    .select({ id: requirementRequests.id })
    .from(requirementRequests)
    .where(and(eq(requirementRequests.organizationId, otherOrg.id), eq(requirementRequests.title, OTHER_REQUIREMENT_TITLE)))
    .limit(1);
  const otherRequirementId =
    existingRequirement?.id ??
    (
      await submitEmployerRequirement(
        otherCtx,
        employerRequirementSchema.parse({ title: OTHER_REQUIREMENT_TITLE, asDraft: "true", lines: [{ roleTitle: "Welder (test)", positions: "2" }] }),
      )
    ).id;
  env.E2E_OTHER_EMPLOYER_EMAIL = otherEmail;
  env.E2E_OTHER_EMPLOYER_PASSWORD = otherPassword;
  env.E2E_OTHER_EMPLOYER_ORG_ID = otherOrg.id;
  env.E2E_OTHER_EMPLOYER_JOB_ID = otherJobId;
  env.E2E_OTHER_EMPLOYER_REQUIREMENT_ID = otherRequirementId;
  log(`  other employer ${otherOrg.id} (${otherOrg.status}), draft job ${otherJobId}, draft requirement ${otherRequirementId}`);
  return env;
}
