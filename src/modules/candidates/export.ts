import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { jobAlerts, jobs, organizations, profileUnlocks, savedJobs } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { tryDecryptField } from "@/lib/crypto";
import { audit, logDataAccess } from "@/modules/audit";
import { listConsentHistory } from "@/modules/identity/consent";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { loadCandidateBundle } from "./loaders";
import type { CandidateDataExport, CandidateSession } from "./types";

/**
 * Everything the platform holds about a candidate in one JSON-serialisable bundle — the input of
 * the privacy module's access / export requests (it adds the files and packages the archive).
 * Includes decrypted identity numbers: the export goes only to the data principal (data_export
 * files are owner-only). Applications, interviews and offers are exported by the recruitment module.
 *
 * Callers: the candidate themselves, or staff with privacy.requests or candidates.export (logged).
 */
export type DataExportRequester = { kind: "self"; session: CandidateSession } | { kind: "staff"; ctx: StaffContext; candidateId: string; reason: string };

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export async function buildCandidateDataExport(requester: DataExportRequester): Promise<CandidateDataExport> {
  let candidateId: string;
  if (requester.kind === "self") {
    candidateId = requester.session.candidate.id;
  } else {
    if (!staffCan(requester.ctx, ["privacy.requests", "candidates.export"], "any")) {
      throw new ActionError("You do not have permission to export candidate data.", { code: "forbidden" });
    }
    candidateId = requester.candidateId;
  }
  const bundle = await loadCandidateBundle(candidateId);
  if (!bundle) throw new ActionError("Candidate profile not found.", { code: "not_found" });
  if (requester.kind === "self" && bundle.user.id !== requester.session.user.id) throw new ActionError("Candidate profile not found.", { code: "not_found" });

  const p = bundle.profile;
  const [saved, alerts, unlocks, consents] = await Promise.all([
    db
      .select({ jobId: savedJobs.jobId, savedAt: savedJobs.createdAt, title: jobs.title, code: jobs.code })
      .from(savedJobs)
      .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
      .where(eq(savedJobs.userId, bundle.user.id))
      .orderBy(desc(savedJobs.createdAt)),
    db.select().from(jobAlerts).where(eq(jobAlerts.userId, bundle.user.id)).orderBy(desc(jobAlerts.createdAt)),
    db
      .select({ organizationName: organizations.name, unlockedAt: profileUnlocks.unlockedAt, expiresAt: profileUnlocks.expiresAt, revokedAt: profileUnlocks.revokedAt })
      .from(profileUnlocks)
      .innerJoin(organizations, eq(organizations.id, profileUnlocks.organizationId))
      .where(eq(profileUnlocks.candidateId, p.id))
      .orderBy(desc(profileUnlocks.unlockedAt)),
    listConsentHistory(bundle.user.id),
  ]);

  const result: CandidateDataExport = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    account: {
      displayName: bundle.user.displayName,
      email: bundle.user.email,
      emailVerifiedAt: iso(bundle.user.emailVerifiedAt),
      phone: bundle.user.phone,
      phoneVerifiedAt: iso(bundle.user.phoneVerifiedAt),
      locale: bundle.user.locale,
      createdAt: iso(bundle.user.createdAt),
    },
    profile: {
      headline: p.headline,
      about: p.about,
      careerObjective: p.careerObjective,
      experienceLevel: p.experienceLevel,
      totalExperienceMonths: p.totalExperienceMonths,
      currentJobTitle: p.currentJobTitle,
      currentEmployerName: p.currentEmployerName,
      industry: bundle.industry?.name ?? null,
      preferredCategories: bundle.preferredCategories.map((c) => c.name),
      preferredRoles: p.preferredRoles,
      desiredEmploymentTypes: p.desiredEmploymentTypes,
      preferredWorkModes: p.preferredWorkModes,
      availability: p.availability,
      availableFrom: p.availableFrom,
      noticePeriodDays: p.noticePeriodDays,
      expectedSalary: p.expectedSalaryMinor !== null ? { amountMinor: p.expectedSalaryMinor, currency: p.expectedSalaryCurrency, period: p.expectedSalaryPeriod } : null,
      currentCountryCode: p.currentCountryCode,
      stateRegion: p.stateRegion,
      city: p.city,
      nationalityCode: p.nationalityCode,
      legalName: p.legalName,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      genderSelfDescription: p.genderSelfDescription,
      willingToRelocate: p.willingToRelocate,
      openToOverseas: p.openToOverseas,
      passportStatus: p.passportStatus,
      passportNumber: tryDecryptField(p.passportNumberEncrypted),
      passportExpiry: p.passportExpiry,
      emigrationCheckStatus: p.emigrationCheckStatus,
      photoFileId: p.photoFileId,
      resumeFileId: p.resumeFileId,
      profileCompleteness: p.profileCompleteness,
      visibility: p.visibility,
      isOpenToWork: p.isOpenToWork,
      verificationLevel: p.verificationLevel,
      source: p.source,
      lastActiveAt: iso(p.lastActiveAt),
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    },
    privacySettings: {
      showFullNameToEmployers: bundle.privacy.showFullNameToEmployers,
      showContactToUnlockedOnly: bundle.privacy.showContactToUnlockedOnly,
      showPhoto: bundle.privacy.showPhoto,
      showCurrentEmployer: bundle.privacy.showCurrentEmployer,
      allowDirectContact: bundle.privacy.allowDirectContact,
      allowPartnerSubmissions: bundle.privacy.allowPartnerSubmissions,
      blockedOrganizationIds: bundle.privacy.blockedOrganizationIds,
    },
    preferredLocations: bundle.preferredLocations.map((l) => ({ countryCode: l.countryCode, stateRegion: l.stateRegion, city: l.city, priority: l.priority })),
    education: bundle.education.map((e) => ({
      educationLevel: e.levelName,
      qualificationType: e.qualificationTypeName,
      institutionName: e.institutionName,
      boardOrUniversity: e.boardOrUniversity,
      qualification: e.qualification,
      specialisation: e.specialisation,
      countryCode: e.countryCode,
      startDate: e.startDate,
      endDate: e.endDate,
      isCurrent: e.isCurrent,
      gradeOrScore: e.gradeOrScore,
      documentFileId: e.documentFileId,
      verificationStatus: e.verificationStatus,
      verificationNote: e.verificationNote,
    })),
    experience: bundle.experience.map((e) => ({
      employerName: e.employerName,
      jobTitle: e.jobTitle,
      industry: e.industryName,
      jobCategory: e.categoryName,
      countryCode: e.countryCode,
      city: e.city,
      employmentType: e.employmentType,
      startDate: e.startDate,
      endDate: e.endDate,
      isCurrent: e.isCurrent,
      responsibilities: e.responsibilities,
      projects: e.projects,
      achievements: e.achievements,
      evidenceFileId: e.evidenceFileId,
      referenceName: e.referenceName,
      referenceContact: e.referenceContact,
      verificationStatus: e.verificationStatus,
      verificationNote: e.verificationNote,
    })),
    skills: bundle.skills.map((s) => ({ name: s.name, level: s.level, yearsExperience: s.yearsExperience, isPrimary: s.isPrimary, verified: s.verified, source: s.source })),
    languages: bundle.languages.map((l) => ({ language: l.name, code: l.code, proficiency: l.proficiency, canRead: l.canRead, canWrite: l.canWrite, canSpeak: l.canSpeak })),
    credentials: bundle.credentials.map((c) => ({
      credentialType: c.credentialType,
      name: c.name,
      issuer: c.issuer,
      issuerType: c.issuerType,
      credentialNumber: c.credentialNumber,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      fileId: c.fileId,
      verificationStatus: c.verificationStatus,
      rejectionReason: c.rejectionReason,
    })),
    documents: bundle.documents.map((d) => ({
      documentType: d.documentType,
      title: d.title,
      documentNumber: tryDecryptField(d.documentNumberEncrypted),
      issuingCountryCode: d.issuingCountryCode,
      issuedAt: d.issuedAt,
      expiresAt: d.expiresAt,
      fileId: d.fileId,
      verificationStatus: d.verificationStatus,
      rejectionReason: d.rejectionReason,
      isShareableWithEmployers: d.isShareableWithEmployers,
      createdAt: iso(d.createdAt),
    })),
    portfolio: bundle.portfolio.map((item) => ({
      title: item.title,
      description: item.description,
      projectDate: item.projectDate,
      location: item.location,
      mediaFileIds: item.mediaFileIds,
      videoUrl: item.videoUrl,
      tags: item.tags,
      isPublic: item.isPublic,
    })),
    assessments: bundle.assessments.map((a) => ({
      code: a.code,
      label: a.label,
      trade: a.trade,
      skill: a.skill?.name ?? null,
      assessmentType: a.assessmentType,
      process: a.process,
      position: a.position,
      standardReference: a.standardReference,
      result: a.result,
      score: a.score,
      maxScore: a.maxScore,
      completedAt: iso(a.completedAt),
    })),
    savedJobs: saved.map((s) => ({ jobCode: s.code, title: s.title, savedAt: iso(s.savedAt) })),
    jobAlerts: alerts.map((a) => ({ name: a.name, criteria: a.criteria, frequency: a.frequency, channels: a.channels, isActive: a.isActive, lastSentAt: iso(a.lastSentAt), createdAt: iso(a.createdAt) })),
    profileUnlocks: unlocks.map((u) => ({ organizationName: u.organizationName, unlockedAt: iso(u.unlockedAt), expiresAt: iso(u.expiresAt), revokedAt: iso(u.revokedAt) })),
    consents: consents.map((c) => ({ purpose: c.purpose, granted: c.granted, source: c.source, policyVersion: c.policyVersion, recordedAt: iso(c.createdAt) })),
    files: [...bundle.files.values()].map((f) => ({ id: f.id, name: f.originalName, mimeType: f.mimeType, purpose: f.purpose, sizeBytes: f.sizeBytes })),
  };

  if (requester.kind === "staff") {
    await logDataAccess({
      actorUserId: requester.ctx.user.id,
      subjectUserId: bundle.user.id,
      subjectType: "candidate",
      subjectId: p.id,
      dataCategory: "export",
      accessType: "export",
      reason: requester.reason,
    });
  }
  await audit({
    action: "candidate.data_exported",
    entityType: "candidate",
    entityId: p.id,
    metadata: { requestedBy: requester.kind, files: result.files.length },
    actorUserId: requester.kind === "self" ? requester.session.user.id : requester.ctx.user.id,
    actorType: requester.kind === "self" ? "user" : "staff",
  });
  return result;
}
