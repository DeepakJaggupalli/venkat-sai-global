import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureCandidateProfile, selfActor, updatePersonalDetails } from "@/modules/candidates/service";
import { personalSchema } from "@/modules/candidates/schemas";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { getConsentState, recordConsent } from "@/modules/identity/consent";

import { dateOfBirthForAge, e2eEmail, generatePassword, loadSessionUser, upsertPasswordUser, type SeedLog } from "./e2e-helpers";
import { ensurePublishedJob } from "./e2e-orgs";

/**
 * E2E seed block for the People Portal specs (ui-talent-jobs, ui-talent-profile, ui-talent-training). Called
 * from runE2eSeed() after E2E Employer Co exists. Local database only (see e2e-guard.ts).
 *
 *  - A dedicated published domestic job that the talent specs apply to and withdraw from (re-applying after a
 *    withdrawal is allowed), so the shared E2E_EMPLOYER_JOB_ID and the employer QA job stay untouched.
 *  - A 16-year-old candidate whose guardian consent is on file and who finished onboarding: the People
 *    Portal opens for them, and the overseas-job refusal (`minor_overseas`) can be checked on its own (the
 *    seeded E2E_MINOR has no consent, so every gated action already stops at `guardian_consent_required`).
 */

const APPLY_JOB_TITLE = "E2E Talent apply job (test job)";
const CONSENTED_MINOR = { key: "TALENT_CONSENTED_MINOR", local: "talent-consented-minor", name: "E2E Consented Minor" } as const;
const ONBOARDING_STEPS = ["goals", "basics", "skills", "availability", "resume", "visibility"] as const;

async function ensureConsentedMinor(keptPassword: string | undefined): Promise<{ userId: string; candidateId: string; email: string; password: string }> {
  const email = e2eEmail(CONSENTED_MINOR.local);
  const password = keptPassword ?? generatePassword({ email, name: CONSENTED_MINOR.name });
  const { id: userId } = await upsertPasswordUser({ email, displayName: CONSENTED_MINOR.name, password }, { passwordChanged: !keptPassword });

  let profile = await ensureCandidateProfile(userId);
  if (!profile.dateOfBirth) {
    profile = await updatePersonalDetails(
      selfActor({ user: await loadSessionUser(userId), candidate: profile }),
      personalSchema.parse({ legalName: CONSENTED_MINOR.name, dateOfBirth: dateOfBirthForAge(16), nationalityCode: "IN", currentCountryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam" }),
    );
  }

  // The latest guardian_consent record decides; re-grant it if a spec or a reset withdrew it.
  const consent = await getConsentState(userId, ["guardian_consent"]);
  if (consent.guardian_consent?.granted !== true) {
    await recordConsent({
      userId,
      purpose: "guardian_consent",
      granted: true,
      source: "admin",
      contextType: "candidate",
      contextId: profile.id,
      evidence: { reason: "E2E seed: test guardian consent (not a real person)", relationship: "parent" },
    });
  }

  const value = JSON.stringify({ talentOnboarding: { goals: ["job", "training"], completed: [...ONBOARDING_STEPS], skipped: [], finishedAt: new Date().toISOString() } });
  await db
    .update(users)
    .set({ preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${value}::jsonb` })
    .where(eq(users.id, userId));

  return { userId, candidateId: profile.id, email, password };
}

export async function seedTalentQa(opts: {
  staff: StaffContext;
  employer: OrgContext<"employer">;
  keptPasswords: Readonly<Record<string, string>>;
  log: SeedLog;
}): Promise<Record<string, string>> {
  const { staff, employer, log } = opts;
  const env: Record<string, string> = {};

  log("People Portal QA:");
  const job = await ensurePublishedJob(
    employer,
    staff,
    {
      title: APPLY_JOB_TITLE,
      summary: "Test job the People Portal specs apply to and withdraw from. Not a real vacancy.",
      descriptionHtml: "<p>Test job. Not a real vacancy.</p>",
      countryCode: "IN",
      stateRegion: "Andhra Pradesh",
      city: "Visakhapatnam",
      employmentType: "full_time",
      workMode: "on_site",
      experienceMinYears: "0",
      experienceMaxYears: "5",
      salaryMin: "18000",
      salaryMax: "24000",
      salaryCurrency: "INR",
      salaryPeriod: "month",
      salaryVisible: "on",
    },
    log,
  );
  env.E2E_TALENT_APPLY_JOB_ID = job.id;
  env.E2E_TALENT_APPLY_JOB_SLUG = job.slug;

  const minor = await ensureConsentedMinor(opts.keptPasswords[`E2E_${CONSENTED_MINOR.key}_PASSWORD`]);
  env[`E2E_${CONSENTED_MINOR.key}_EMAIL`] = minor.email;
  env[`E2E_${CONSENTED_MINOR.key}_PASSWORD`] = minor.password;
  env[`E2E_${CONSENTED_MINOR.key}_CANDIDATE_ID`] = minor.candidateId;
  log(`  consented minor ${minor.candidateId} (${minor.email})`);

  return env;
}
