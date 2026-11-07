import "server-only";

import type { CandidateBundle } from "./loaders";
import { summarizeFile } from "./loaders";
import type { DocumentScope } from "./policy";
import type {
  CandidateCredentialView,
  CandidateDocumentView,
  CandidateEducationView,
  CandidateExperienceView,
  CandidatePortfolioView,
  CandidatePreferredLocationView,
} from "./types";

/**
 * Row → view mappers for a loaded candidate bundle. The flags come from the access decision
 * (policy.ts); these functions never decide access themselves.
 */

export function presentEducation(bundle: CandidateBundle, opts: { documents: boolean }): CandidateEducationView[] {
  return bundle.education.map((e) => ({
    id: e.id,
    educationLevel: e.educationLevelId && e.levelName ? { id: e.educationLevelId, name: e.levelName } : null,
    qualificationType: e.qualificationTypeId && e.qualificationTypeName ? { id: e.qualificationTypeId, name: e.qualificationTypeName } : null,
    institutionName: e.institutionName,
    boardOrUniversity: e.boardOrUniversity,
    qualification: e.qualification,
    specialisation: e.specialisation,
    countryCode: e.countryCode,
    startDate: e.startDate,
    endDate: e.endDate,
    isCurrent: e.isCurrent,
    gradeOrScore: e.gradeOrScore,
    verificationStatus: e.verificationStatus,
    document: opts.documents ? summarizeFile(bundle, e.documentFileId) : null,
  }));
}

export function presentExperience(bundle: CandidateBundle, opts: { evidence: boolean; references: boolean; showCurrentEmployer: boolean }): CandidateExperienceView[] {
  return bundle.experience.map((e) => ({
    id: e.id,
    employerName: e.isCurrent && !opts.showCurrentEmployer ? null : e.employerName,
    jobTitle: e.jobTitle,
    industry: e.industryId && e.industryName ? { id: e.industryId, name: e.industryName } : null,
    jobCategory: e.jobCategoryId && e.categoryName ? { id: e.jobCategoryId, name: e.categoryName } : null,
    countryCode: e.countryCode,
    city: e.city,
    employmentType: e.employmentType,
    startDate: e.startDate,
    endDate: e.endDate,
    isCurrent: e.isCurrent,
    responsibilities: e.responsibilities,
    projects: e.projects,
    achievements: e.achievements,
    verificationStatus: e.verificationStatus,
    evidence: opts.evidence ? summarizeFile(bundle, e.evidenceFileId) : null,
    reference: opts.references && (e.referenceName || e.referenceContact) ? { name: e.referenceName, contact: e.referenceContact } : null,
  }));
}

/** Organisations never see credentials staff rejected, nor credential numbers and files. */
export function presentCredentials(bundle: CandidateBundle, opts: { privateDetails: boolean; files: boolean }): CandidateCredentialView[] {
  return bundle.credentials
    .filter((c) => opts.privateDetails || c.verificationStatus !== "rejected")
    .map((c) => ({
      id: c.id,
      credentialType: c.credentialType,
      name: c.name,
      issuer: c.issuer,
      issuerType: c.issuerType,
      credentialNumber: opts.privateDetails ? c.credentialNumber : null,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      verificationStatus: c.verificationStatus,
      rejectionReason: opts.privateDetails ? c.rejectionReason : null,
      file: opts.files ? summarizeFile(bundle, c.fileId) : null,
      certificateId: c.certificateId,
    }));
}

export function presentPortfolio(bundle: CandidateBundle, opts: { includePrivate: boolean }): CandidatePortfolioView[] {
  return bundle.portfolio
    .filter((p) => opts.includePrivate || p.isPublic)
    .map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      projectDate: p.projectDate,
      location: p.location,
      media: p.mediaFileIds.map((id) => summarizeFile(bundle, id)).filter((f): f is NonNullable<typeof f> => f !== null),
      videoUrl: p.videoUrl,
      tags: p.tags,
      isPublic: p.isPublic,
      sortOrder: p.sortOrder,
    }));
}

/** Documents in the viewer's scope (see policy.ts DocumentScope). */
export function selectDocuments(bundle: CandidateBundle, scope: DocumentScope, viewerOrganizationId: string | null): CandidateBundle["documents"] {
  switch (scope) {
    case "all":
      return bundle.documents;
    case "shareable":
      return bundle.documents.filter((d) => d.isShareableWithEmployers && d.verificationStatus !== "rejected");
    case "viewer_uploads":
      return bundle.documents.filter((d) => viewerOrganizationId !== null && bundle.files.get(d.fileId)?.organizationId === viewerOrganizationId);
    case "none":
      return [];
  }
}

export function presentDocuments(bundle: CandidateBundle, documents: CandidateBundle["documents"], opts: { privateDetails: boolean; numbers: boolean }): CandidateDocumentView[] {
  return documents.map((d) => ({
    id: d.id,
    documentType: d.documentType,
    title: d.title,
    issuingCountryCode: d.issuingCountryCode,
    issuedAt: d.issuedAt,
    expiresAt: d.expiresAt,
    verificationStatus: d.verificationStatus,
    rejectionReason: opts.privateDetails ? d.rejectionReason : null,
    isShareableWithEmployers: d.isShareableWithEmployers,
    numberLast4: opts.numbers ? d.documentNumberLast4 : null,
    file: summarizeFile(bundle, d.fileId),
    createdAt: d.createdAt,
  }));
}

export function presentPreferredLocations(bundle: CandidateBundle): CandidatePreferredLocationView[] {
  return bundle.preferredLocations.map((l) => ({
    id: l.id,
    countryCode: l.countryCode,
    countryName: bundle.countryNames.get(l.countryCode) ?? null,
    stateRegion: l.stateRegion,
    city: l.city,
    priority: l.priority,
  }));
}
