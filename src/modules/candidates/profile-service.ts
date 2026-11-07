import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { encryptField, hmacToken } from "@/lib/crypto";
import { toMinorUnits } from "@/lib/format";
import { audit } from "@/modules/audit";

import { auditContext, lockCandidateTarget } from "./actor";
import { refreshCandidateDerived } from "./derived";
import { revokeProfileGrantsForFiles } from "./file-grants";
import { isMinor, last4, normaliseIdentityNumber } from "./profile-rules";
import { assertCountries, assertCurrency, assertIndustry, assertJobCategories, hasGuardianConsentRecord } from "./refs";
import type { PersonalInput, PreferencesInput, ProfessionalInput } from "./schemas";
import type { CandidateActor, CandidateProfileRow } from "./types";
import { acceptCandidateUpload } from "./uploads";

/**
 * Profile section services (personal, professional, preferences, resume, photo). Each one replaces
 * its section, recomputes the derived columns (completeness, search text, verification level) in
 * the same transaction and audits changes to identity data and staff edits.
 */

const IDENTITY_FIELDS = ["legalName", "dateOfBirth", "gender", "nationalityCode", "passportStatus", "passportExpiry", "emigrationCheckStatus"] as const;

/** Personal details: identity (never searchable), current location and passport. */
export async function updatePersonalDetails(actor: CandidateActor, input: PersonalInput): Promise<CandidateProfileRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertCountries([input.nationalityCode], "nationalityCode", tx);
    await assertCountries([input.currentCountryCode], "currentCountryCode", tx);

    const before = target.candidate;
    const passport: Partial<typeof candidateProfiles.$inferInsert> = {};
    let passportChange: "set" | "cleared" | null = null;
    if (input.passportNumber) {
      const normalised = normaliseIdentityNumber(input.passportNumber);
      passport.passportNumberEncrypted = encryptField(normalised);
      passport.passportNumberLast4 = last4(normalised);
      passport.passportNumberHash = hmacToken(normalised, "passport");
      passportChange = "set";
    } else if (input.clearPassportNumber || input.passportStatus === "none" || input.passportStatus === "applied" || !input.passportStatus) {
      // No passport (or not yet issued): a stored number would be stale.
      if (before.passportNumberEncrypted) passportChange = "cleared";
      passport.passportNumberEncrypted = null;
      passport.passportNumberLast4 = null;
      passport.passportNumberHash = null;
    }

    const values = {
      legalName: input.legalName ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      gender: input.gender ?? null,
      genderSelfDescription: input.gender === "self_described" ? (input.genderSelfDescription ?? null) : null,
      nationalityCode: input.nationalityCode ?? null,
      currentCountryCode: input.currentCountryCode ?? null,
      stateRegion: input.stateRegion ?? null,
      city: input.city ?? null,
      passportStatus: input.passportStatus ?? null,
      passportExpiry: input.passportStatus === "valid" || input.passportStatus === "expired" ? (input.passportExpiry ?? null) : null,
      emigrationCheckStatus: input.emigrationCheckStatus ?? null,
      ...passport,
    };
    await tx.update(candidateProfiles).set(values).where(eq(candidateProfiles.id, target.candidateId));

    const changedIdentity = IDENTITY_FIELDS.filter((key) => (before[key] ?? null) !== (values[key] ?? null));
    if (changedIdentity.length || passportChange || target.onBehalf) {
      await audit({
        action: "candidate.personal_updated",
        entityType: "candidate",
        entityId: target.candidateId,
        // Field names only — never the values (identity data stays out of the audit trail).
        metadata: { changedIdentityFields: changedIdentity, passportNumber: passportChange, onBehalf: target.onBehalf },
        ...auditContext(target),
        tx,
      });
    }
    const { profile } = await refreshCandidateDerived(target.candidateId, tx);
    return profile;
  });
}

/** Professional summary: headline, about, objective, experience, current role, industry, notice period. */
export async function updateProfessionalSummary(actor: CandidateActor, input: ProfessionalInput): Promise<CandidateProfileRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertIndustry(input.industryId, "industryId", tx);
    const hasExperience = input.experienceYears !== undefined || input.experienceExtraMonths !== undefined;
    const totalExperienceMonths = hasExperience ? (input.experienceYears ?? 0) * 12 + (input.experienceExtraMonths ?? 0) : null;
    if (input.experienceLevel === "fresher" && (totalExperienceMonths ?? 0) > 24) {
      throw new ActionError("A fresher has less than two years of experience. Choose another experience level.", {
        fieldErrors: { experienceLevel: ["Does not match your years of experience"] },
      });
    }
    await tx
      .update(candidateProfiles)
      .set({
        headline: input.headline ?? null,
        about: input.about ?? null,
        careerObjective: input.careerObjective ?? null,
        experienceLevel: input.experienceLevel ?? null,
        totalExperienceMonths,
        currentJobTitle: input.currentJobTitle ?? null,
        currentEmployerName: input.currentEmployerName ?? null,
        industryId: input.industryId ?? null,
        noticePeriodDays: input.noticePeriodDays ?? null,
      })
      .where(eq(candidateProfiles.id, target.candidateId));
    if (target.onBehalf) {
      await audit({ action: "candidate.professional_updated", entityType: "candidate", entityId: target.candidateId, metadata: { onBehalf: true }, ...auditContext(target), tx });
    }
    const { profile } = await refreshCandidateDerived(target.candidateId, tx);
    return profile;
  });
}

/** Job preferences: categories, roles, employment types, work modes, availability, salary, relocation, overseas. */
export async function updateJobPreferences(actor: CandidateActor, input: PreferencesInput): Promise<CandidateProfileRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertJobCategories(input.preferredCategoryIds, "preferredCategoryIds", tx);
    await assertCurrency(input.expectedSalaryCurrency, "expectedSalaryCurrency", tx);

    if (input.openToOverseas && !target.candidate.openToOverseas) {
      const minor = isMinor(target.candidate.dateOfBirth, await hasGuardianConsentRecord(target.userId, tx));
      if (minor) {
        throw new ActionError("Overseas jobs are open to candidates aged 18 or over.", {
          code: "minor_overseas",
          fieldErrors: { openToOverseas: ["Available from the age of 18"] },
        });
      }
    }

    const hasSalary = input.expectedSalaryAmount !== undefined && input.expectedSalaryCurrency && input.expectedSalaryPeriod;
    await tx
      .update(candidateProfiles)
      .set({
        preferredCategoryIds: input.preferredCategoryIds,
        preferredRoles: input.preferredRoles,
        desiredEmploymentTypes: input.desiredEmploymentTypes,
        preferredWorkModes: input.preferredWorkModes,
        availability: input.availability ?? null,
        availableFrom: input.availableFrom ?? null,
        expectedSalaryMinor: hasSalary ? toMinorUnits(input.expectedSalaryAmount!, input.expectedSalaryCurrency!) : null,
        expectedSalaryCurrency: hasSalary ? input.expectedSalaryCurrency! : null,
        expectedSalaryPeriod: hasSalary ? input.expectedSalaryPeriod! : null,
        willingToRelocate: input.willingToRelocate,
        openToOverseas: input.openToOverseas,
      })
      .where(eq(candidateProfiles.id, target.candidateId));
    if (target.onBehalf) {
      await audit({ action: "candidate.preferences_updated", entityType: "candidate", entityId: target.candidateId, metadata: { onBehalf: true }, ...auditContext(target), tx });
    }
    const { profile } = await refreshCandidateDerived(target.candidateId, tx);
    return profile;
  });
}

/** Set (fileId) or remove (null) the profile resume. Employers' access to the old file is revoked. */
export async function setCandidateResume(actor: CandidateActor, fileId: string | null): Promise<CandidateProfileRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const previous = target.candidate.resumeFileId;
    if (fileId === previous) return target.candidate;
    if (fileId) await acceptCandidateUpload(target, fileId, ["resume"], tx);
    await tx
      .update(candidateProfiles)
      .set({ resumeFileId: fileId, resumeUpdatedAt: fileId ? new Date() : null })
      .where(eq(candidateProfiles.id, target.candidateId));
    if (previous) await revokeProfileGrantsForFiles([previous], target.actorUserId, tx);
    await audit({
      action: fileId ? "candidate.resume_updated" : "candidate.resume_removed",
      entityType: "candidate",
      entityId: target.candidateId,
      metadata: { fileId, previousFileId: previous, onBehalf: target.onBehalf },
      ...auditContext(target),
      tx,
    });
    const { profile } = await refreshCandidateDerived(target.candidateId, tx);
    return profile;
  });
}

/** Set (fileId) or remove (null) the profile photo. Employers' access to the old photo is revoked. */
export async function setCandidatePhoto(actor: CandidateActor, fileId: string | null): Promise<CandidateProfileRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const previous = target.candidate.photoFileId;
    if (fileId === previous) return target.candidate;
    if (fileId) await acceptCandidateUpload(target, fileId, ["avatar"], tx);
    await tx.update(candidateProfiles).set({ photoFileId: fileId }).where(eq(candidateProfiles.id, target.candidateId));
    if (previous) await revokeProfileGrantsForFiles([previous], target.actorUserId, tx);
    if (target.onBehalf) {
      await audit({ action: "candidate.photo_updated", entityType: "candidate", entityId: target.candidateId, metadata: { onBehalf: true, fileId }, ...auditContext(target), tx });
    }
    const { profile } = await refreshCandidateDerived(target.candidateId, tx);
    return profile;
  });
}
