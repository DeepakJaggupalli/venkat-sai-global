import "server-only";

import { and, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { applications, candidateAttributions, candidatePrivacySettings, candidateProfiles, jobs, profileUnlocks, users } from "@/db/schema";
import { maskEmail, maskPhone } from "@/lib/format";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { logDataAccess } from "@/modules/audit";
import { getConsentState } from "@/modules/identity/consent";

import { syncOrganizationProfileGrants } from "./file-grants";
import { loadCandidateBundle, summarizeFile, type CandidateBundle } from "./loaders";
import { restrictedMinorSql } from "./minor-sql";
import { DEFAULT_PRIVACY_FLAGS, maskedName, resolveCandidateAccess, type CandidateAccess, type CandidateState, type ViewerFacts } from "./policy";
import { presentCredentials, presentDocuments, presentEducation, presentExperience, presentPortfolio, presentPreferredLocations, selectDocuments } from "./present";
import { isMinor } from "./profile-rules";
import { hasGuardianConsentRecord } from "./refs";
import type { CandidateContactView, CandidateView, CandidateViewer } from "./types";

export type CandidateViewOptions = {
  /** Show contact details (and, for staff, reference contacts) instead of masked values. Logged. */
  revealContact?: boolean;
  /** Staff with candidates.view_documents: include legal name, date of birth, nationality, passport details. Logged. */
  revealIdentity?: boolean;
  /** Why the viewer needs the data (stored with the data-access log). */
  reason?: string | null;
};

/** Relationship facts for an employer organisation (applications shared with it, active unlock). */
export async function employerRelationship(candidateId: string, organizationId: string): Promise<{ hasApplicationShare: boolean; activeUnlock: { expiresAt: Date | null } | null }> {
  const now = new Date();
  const [shared, unlock] = await Promise.all([
    db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(applications.candidateId, candidateId),
          eq(jobs.organizationId, organizationId),
          isNotNull(applications.consentToShareAt),
          isNotNull(applications.sharedWithEmployerAt),
          ne(applications.status, "withdrawn"),
        ),
      )
      .limit(1),
    db
      .select({ expiresAt: profileUnlocks.expiresAt })
      .from(profileUnlocks)
      .where(
        and(
          eq(profileUnlocks.organizationId, organizationId),
          eq(profileUnlocks.candidateId, candidateId),
          isNull(profileUnlocks.revokedAt),
          or(isNull(profileUnlocks.expiresAt), gt(profileUnlocks.expiresAt, now)),
        ),
      )
      .limit(1),
  ]);
  return { hasApplicationShare: shared.length > 0, activeUnlock: unlock[0] ? { expiresAt: unlock[0].expiresAt } : null };
}

/** Did this partner source the candidate (active attribution, or the profile's sourcing partner)? */
export async function isSourcingPartner(candidateId: string, partnerOrganizationId: string, sourcedByPartnerOrgId: string | null): Promise<boolean> {
  if (sourcedByPartnerOrgId === partnerOrganizationId) return true;
  const [row] = await db
    .select({ id: candidateAttributions.id })
    .from(candidateAttributions)
    .where(
      and(
        eq(candidateAttributions.candidateId, candidateId),
        eq(candidateAttributions.partnerOrganizationId, partnerOrganizationId),
        eq(candidateAttributions.status, "active"),
        or(isNull(candidateAttributions.expiresAt), gt(candidateAttributions.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function viewerFacts(candidate: { id: string; sourcedByPartnerOrgId: string | null }, viewer: CandidateViewer): Promise<ViewerFacts> {
  switch (viewer.kind) {
    case "self":
      return { kind: "self" };
    case "staff":
      return { kind: "staff", permissions: viewer.ctx.permissions };
    case "employer": {
      const relationship = await employerRelationship(candidate.id, viewer.ctx.organization.id);
      return {
        kind: "employer",
        organizationId: viewer.ctx.organization.id,
        organizationStatus: viewer.ctx.organization.status,
        permissions: viewer.ctx.permissions,
        ...relationship,
      };
    }
    case "partner":
      return {
        kind: "partner",
        organizationId: viewer.ctx.organization.id,
        organizationStatus: viewer.ctx.organization.status,
        permissions: viewer.ctx.permissions,
        isSourcingPartner: await isSourcingPartner(candidate.id, viewer.ctx.organization.id, candidate.sourcedByPartnerOrgId),
      };
  }
}

/** The facts policy.ts needs about the candidate, in one query. */
async function loadAccessState(candidateId: string): Promise<(CandidateState & { id: string; sourcedByPartnerOrgId: string | null }) | null> {
  const [row] = await db
    .select({
      id: candidateProfiles.id,
      visibility: candidateProfiles.visibility,
      isOpenToWork: candidateProfiles.isOpenToWork,
      deletedAt: candidateProfiles.deletedAt,
      sourcedByPartnerOrgId: candidateProfiles.sourcedByPartnerOrgId,
      userStatus: users.status,
      privacy: candidatePrivacySettings,
      restrictedMinor: sql<boolean>`${restrictedMinorSql}`,
    })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    sourcedByPartnerOrgId: row.sourcedByPartnerOrgId,
    visibility: row.visibility,
    isOpenToWork: row.isOpenToWork,
    deleted: row.deletedAt !== null,
    accountActive: row.userStatus === "active",
    privacy: row.privacy ?? DEFAULT_PRIVACY_FLAGS,
    restrictedMinor: row.restrictedMinor === true,
  };
}

const viewerUserId = (viewer: CandidateViewer): string => (viewer.kind === "staff" || viewer.kind === "employer" || viewer.kind === "partner" ? viewer.ctx.user.id : viewer.user.id);
const viewerOrgId = (viewer: CandidateViewer): string | null => (viewer.kind === "employer" || viewer.kind === "partner" ? viewer.ctx.organization.id : null);

/**
 * Privacy-aware projection of a candidate profile for one viewer — the ONLY way other portals
 * should read a candidate profile. Returns null when the viewer may not see the profile at all
 * (not found, blocked, not discoverable, not sourced, no permission) — treat it as "not found".
 * Sensitive reveals are logged with logDataAccess(); organisations' file grants are kept in sync.
 */
export async function getCandidateView(candidateId: string, viewer: CandidateViewer, opts: CandidateViewOptions = {}): Promise<CandidateView | null> {
  if (viewer.kind === "self" && (viewer.candidate.id !== candidateId || viewer.candidate.userId !== viewer.user.id)) return null;
  // Decide access before loading the full profile, so a denied viewer costs two small queries.
  const state = await loadAccessState(candidateId);
  if (!state) return null;
  const access = resolveCandidateAccess(state, await viewerFacts(state, viewer));
  if (!access.canView) return null;
  const bundle = await loadCandidateBundle(candidateId);
  if (!bundle) return null;

  const [consents, guardian] = await Promise.all([
    getConsentState(bundle.user.id, ["share_assessment_results", "contact_references"]),
    hasGuardianConsentRecord(bundle.user.id, db),
  ]);
  const assessmentConsent = consents.share_assessment_results?.granted === true;
  const minor = isMinor(bundle.profile.dateOfBirth, guardian);

  const view = buildView(bundle, viewer, access, opts, { assessmentConsent, referencesConsent: consents.contact_references?.granted === true, minor });
  await afterView(bundle, viewer, access, view, opts);
  return view;
}

function buildView(
  bundle: CandidateBundle,
  viewer: CandidateViewer,
  access: CandidateAccess,
  opts: CandidateViewOptions,
  extra: { assessmentConsent: boolean; referencesConsent: boolean; minor: boolean },
): CandidateView {
  const p = bundle.profile;
  const isSelf = viewer.kind === "self";
  const isStaff = viewer.kind === "staff";
  const revealContact = access.contact === "on_reveal" && opts.revealContact === true;
  const revealIdentity = access.identity && (isSelf || opts.revealIdentity === true);

  let contact: CandidateContactView;
  if (access.contact === "full" || revealContact) {
    contact = {
      state: "full",
      email: bundle.user.email,
      phone: bundle.user.phone,
      emailVerified: bundle.user.emailVerifiedAt !== null,
      phoneVerified: bundle.user.phoneVerifiedAt !== null,
    };
  } else if (access.contact === "on_reveal") {
    contact = { state: "masked", email: bundle.user.email ? maskEmail(bundle.user.email) : null, phone: bundle.user.phone ? maskPhone(bundle.user.phone) : null, canReveal: true };
  } else {
    contact = { state: "hidden", reason: access.contactHiddenReason ?? "permission_required" };
  }

  // Organisations see passed assessments only, and only when the candidate agreed to share results.
  const assessments = isSelf || isStaff ? bundle.assessments : extra.assessmentConsent ? bundle.assessments.filter((a) => a.result === "pass") : [];
  const documents = selectDocuments(bundle, access.documents, viewerOrgId(viewer));
  const privateDetails = isSelf || isStaff;

  return {
    candidateId: p.id,
    viewer: viewer.kind,
    access,
    name: access.fullName
      ? { display: bundle.user.displayName, full: bundle.user.displayName, masked: false }
      : { display: maskedName(bundle.user.displayName), full: null, masked: true },
    photo: access.photo ? summarizeFile(bundle, p.photoFileId) : null,
    headline: p.headline,
    about: p.about,
    careerObjective: p.careerObjective,
    currentJobTitle: p.currentJobTitle,
    currentEmployerName: access.currentEmployer ? p.currentEmployerName : null,
    experienceLevel: p.experienceLevel,
    totalExperienceMonths: p.totalExperienceMonths,
    industry: bundle.industry,
    location: {
      countryCode: p.currentCountryCode,
      countryName: p.currentCountryCode ? (bundle.countryNames.get(p.currentCountryCode) ?? null) : null,
      stateRegion: p.stateRegion,
      city: p.city,
    },
    availability: p.availability,
    availableFrom: p.availableFrom,
    noticePeriodDays: p.noticePeriodDays,
    preferences: {
      categories: bundle.preferredCategories,
      roles: p.preferredRoles,
      employmentTypes: p.desiredEmploymentTypes,
      workModes: p.preferredWorkModes,
      willingToRelocate: p.willingToRelocate,
      // A minor is never presented as available for overseas work (DPDP children's-data rule).
      openToOverseas: p.openToOverseas && !extra.minor,
      locations: presentPreferredLocations(bundle),
    },
    expectedSalary:
      access.expectedSalary && p.expectedSalaryMinor !== null && p.expectedSalaryCurrency && p.expectedSalaryPeriod
        ? { amountMinor: p.expectedSalaryMinor, currency: p.expectedSalaryCurrency, period: p.expectedSalaryPeriod }
        : null,
    passportStatus: p.passportStatus,
    verificationLevel: p.verificationLevel,
    isOpenToWork: p.isOpenToWork,
    visibility: privateDetails ? p.visibility : null,
    lastActiveAt: p.lastActiveAt,
    skills: bundle.skills,
    languages: bundle.languages,
    education: presentEducation(bundle, { documents: isSelf || (isStaff && access.documents === "all") }),
    experience: presentExperience(bundle, {
      evidence: isSelf || (isStaff && access.documents === "all"),
      references: isSelf || (access.references && revealContact),
      showCurrentEmployer: access.currentEmployer,
    }),
    credentials: presentCredentials(bundle, { privateDetails, files: isSelf || (isStaff && access.documents === "all") }),
    assessments,
    portfolio: presentPortfolio(bundle, { includePrivate: access.portfolio === "all" }),
    documents: presentDocuments(bundle, documents, { privateDetails, numbers: isSelf || (isStaff && revealIdentity) }),
    resume: access.resume ? summarizeFile(bundle, p.resumeFileId) : null,
    contact,
    identity: revealIdentity
      ? {
          legalName: p.legalName,
          dateOfBirth: p.dateOfBirth,
          gender: access.gender ? p.gender : null,
          genderSelfDescription: access.gender ? p.genderSelfDescription : null,
          nationalityCode: p.nationalityCode,
          passportNumberLast4: p.passportNumberLast4,
          passportExpiry: p.passportExpiry,
          emigrationCheckStatus: p.emigrationCheckStatus,
        }
      : null,
    identityAvailable: access.identity,
    internal: access.internal
      ? {
          source: p.source,
          sourcedByPartnerOrgId: p.sourcedByPartnerOrgId,
          createdByUserId: p.createdByUserId,
          profileCompleteness: p.profileCompleteness,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          referencesConsent: extra.referencesConsent,
          assessmentSharingConsent: extra.assessmentConsent,
          isMinor: extra.minor,
        }
      : null,
  };
}

/** Data-access logging and file-grant sync after a successful view (never for the candidate themselves). */
async function afterView(bundle: CandidateBundle, viewer: CandidateViewer, access: CandidateAccess, view: CandidateView, opts: CandidateViewOptions): Promise<void> {
  if (viewer.kind === "self") return;
  const base = {
    actorUserId: viewerUserId(viewer),
    actorOrganizationId: viewerOrgId(viewer),
    subjectUserId: bundle.user.id,
    subjectType: "candidate",
    subjectId: bundle.profile.id,
    reason: opts.reason ?? null,
  };
  try {
    if (view.contact.state === "full") {
      await logDataAccess({ ...base, dataCategory: "contact", accessType: "reveal", metadata: { viewer: viewer.kind, references: view.experience.some((e) => e.reference !== null) } });
    }
    if (view.identity) {
      await logDataAccess({ ...base, dataCategory: "identity", accessType: "view", metadata: { viewer: viewer.kind } });
    }
    // Organisation profile views are recorded once per organisation, candidate and day
    // (lets the candidate see who looked at their profile without flooding the log).
    if (viewer.kind === "employer" || viewer.kind === "partner") {
      const throttle = await rateLimit(`candidate-view-log:${viewer.ctx.organization.id}:${bundle.profile.id}`, 1, 24 * 60 * 60);
      if (throttle.allowed) {
        await logDataAccess({ ...base, dataCategory: "profile", accessType: "view", metadata: { viewer: viewer.kind, relationship: access.relationship } });
      }
    }
  } catch (error) {
    logger.error("Failed to log candidate data access", { error, candidateId: bundle.profile.id });
  }

  if (viewer.kind === "employer" || viewer.kind === "partner") {
    const fileIds = new Set<string>();
    if (view.photo) fileIds.add(view.photo.id);
    if (view.resume) fileIds.add(view.resume.id);
    for (const item of view.portfolio) for (const media of item.media) fileIds.add(media.id);
    // Documents the viewer's own organisation uploaded are readable through membership already.
    if (access.documents === "shareable") for (const doc of view.documents) if (doc.file) fileIds.add(doc.file.id);
    await syncOrganizationProfileGrants({
      candidateId: bundle.profile.id,
      organizationId: viewer.ctx.organization.id,
      fileIds: [...fileIds],
      grantedByUserId: viewer.ctx.user.id,
    });
  }
}

/**
 * The access decision alone (no profile data, no logging, no grants) — e.g. to decide whether to
 * show a "View profile" link or to check a relationship before messaging. Null when not found.
 */
export async function getCandidateAccess(candidateId: string, viewer: CandidateViewer): Promise<CandidateAccess | null> {
  if (viewer.kind === "self" && viewer.candidate.id !== candidateId) return null;
  const state = await loadAccessState(candidateId);
  if (!state) return null;
  return resolveCandidateAccess(state, await viewerFacts(state, viewer));
}
