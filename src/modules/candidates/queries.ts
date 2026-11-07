import "server-only";

import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { dataAccessLogs, organizations } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { logDataAccess } from "@/modules/audit";
import { staffCan } from "@/modules/identity/authz";

import { computeExperienceMonths, computeProfileCompleteness, type CompletenessResult, type NextBestAction } from "./completeness";
import { loadCandidateBundle, summarizeFile, type CandidateBundle } from "./loaders";
import { presentCredentials, presentDocuments, presentEducation, presentExperience, presentPortfolio, presentPreferredLocations } from "./present";
import { escapeLike, isMinor } from "./profile-rules";
import { hasGuardianConsentRecord } from "./refs";
import type { CandidateActor, CandidateProfileDetail, CandidateSession } from "./types";

// Re-exported so callers can import every candidate read from one place.
export { getCandidateView, getCandidateAccess } from "./viewer";
export { searchCandidates } from "./search";

/** Completeness straight from a loaded bundle (no extra queries). */
export function completenessFromBundle(bundle: CandidateBundle): CompletenessResult {
  const p = bundle.profile;
  return computeProfileCompleteness({
    headline: p.headline,
    about: p.about,
    careerObjective: p.careerObjective,
    currentCountryCode: p.currentCountryCode,
    city: p.city,
    contactVerified: Boolean(bundle.user.emailVerifiedAt || bundle.user.phoneVerifiedAt),
    preferredCategoryCount: p.preferredCategoryIds.length,
    preferredRoleCount: p.preferredRoles.length,
    desiredEmploymentTypeCount: p.desiredEmploymentTypes.length,
    preferredWorkModeCount: p.preferredWorkModes.length,
    availability: p.availability,
    hasExpectedSalary: p.expectedSalaryMinor !== null,
    experienceCount: bundle.experience.length,
    isFresher: p.experienceLevel === "fresher",
    educationCount: bundle.education.length,
    skillCount: bundle.skills.length,
    languageCount: bundle.languages.length,
    hasResume: p.resumeFileId !== null,
    hasPhoto: p.photoFileId !== null,
    openToOverseas: p.openToOverseas,
    passportStatus: p.passportStatus,
    unverifiedDocumentCount: bundle.documents.filter((d) => d.verificationStatus === "unverified" && d.documentType !== "resume" && d.documentType !== "photo").length,
    rejectedDocumentCount: bundle.documents.filter((d) => d.verificationStatus === "rejected").length,
    visibility: p.visibility,
  });
}

/**
 * The complete profile for the profile editor: the candidate's own profile, or — for staff with
 * candidates.manage editing on the candidate's behalf — any profile (logged as a data access).
 * Includes write-only hints (`suggestedExperienceMonths`) the editor can offer.
 */
export async function getCandidateProfileDetail(actor: CandidateActor): Promise<(CandidateProfileDetail & { suggestedExperienceMonths: number }) | null> {
  let candidateId: string;
  if (actor.kind === "self") {
    if (actor.candidate.userId !== actor.user.id) return null;
    candidateId = actor.candidate.id;
  } else {
    if (!staffCan(actor.staff, "candidates.manage")) throw new ActionError("You do not have permission to edit candidate records.", { code: "forbidden" });
    candidateId = actor.candidateId;
  }
  const bundle = await loadCandidateBundle(candidateId);
  if (!bundle) return null;
  if (actor.kind === "self" && bundle.user.id !== actor.user.id) return null;
  if (actor.kind === "staff") {
    await logDataAccess({
      actorUserId: actor.staff.user.id,
      subjectUserId: bundle.user.id,
      subjectType: "candidate",
      subjectId: candidateId,
      dataCategory: "profile_record",
      accessType: "view",
      reason: "Editing the candidate record",
    });
  }
  const minor = isMinor(bundle.profile.dateOfBirth, await hasGuardianConsentRecord(bundle.user.id, db));
  return {
    profile: bundle.profile,
    account: {
      userId: bundle.user.id,
      displayName: bundle.user.displayName,
      email: bundle.user.email,
      phone: bundle.user.phone,
      emailVerified: bundle.user.emailVerifiedAt !== null,
      phoneVerified: bundle.user.phoneVerifiedAt !== null,
      locale: bundle.user.locale,
    },
    privacy: bundle.privacy,
    completeness: completenessFromBundle(bundle),
    photo: summarizeFile(bundle, bundle.profile.photoFileId),
    resume: summarizeFile(bundle, bundle.profile.resumeFileId),
    education: presentEducation(bundle, { documents: true }),
    experience: presentExperience(bundle, { evidence: true, references: true, showCurrentEmployer: true }),
    skills: bundle.skills,
    languages: bundle.languages,
    credentials: presentCredentials(bundle, { privateDetails: true, files: true }),
    assessments: bundle.assessments,
    portfolio: presentPortfolio(bundle, { includePrivate: true }),
    documents: presentDocuments(bundle, bundle.documents, { privateDetails: true, numbers: true }),
    preferredLocations: presentPreferredLocations(bundle),
    preferredCategories: bundle.preferredCategories,
    isMinor: minor,
    suggestedExperienceMonths: computeExperienceMonths(bundle.experience),
  };
}

export type CandidateDashboardSummary = {
  profileCompleteness: number;
  nextActions: NextBestAction[];
  verificationLevel: CandidateSession["candidate"]["verificationLevel"];
  visibility: CandidateSession["candidate"]["visibility"];
  isOpenToWork: boolean;
  documents: { total: number; pending: number; verified: number; rejected: number; unverified: number };
  credentials: { total: number; verified: number };
  hasResume: boolean;
};

/** People Portal dashboard card: completeness, top hints, verification and document status. */
export async function getCandidateDashboardSummary(session: CandidateSession, opts: { hints?: number } = {}): Promise<CandidateDashboardSummary> {
  const bundle = await loadCandidateBundle(session.candidate.id);
  if (!bundle || bundle.user.id !== session.user.id) throw new ActionError("Candidate profile not found.", { code: "not_found" });
  const completeness = completenessFromBundle(bundle);
  const docs = bundle.documents;
  return {
    profileCompleteness: completeness.score,
    nextActions: completeness.nextActions.slice(0, opts.hints ?? 5),
    verificationLevel: bundle.profile.verificationLevel,
    visibility: bundle.profile.visibility,
    isOpenToWork: bundle.profile.isOpenToWork,
    documents: {
      total: docs.length,
      pending: docs.filter((d) => d.verificationStatus === "pending").length,
      verified: docs.filter((d) => d.verificationStatus === "verified").length,
      rejected: docs.filter((d) => d.verificationStatus === "rejected").length,
      unverified: docs.filter((d) => d.verificationStatus === "unverified").length,
    },
    credentials: { total: bundle.credentials.length, verified: bundle.credentials.filter((c) => c.verificationStatus === "verified").length },
    hasResume: bundle.profile.resumeFileId !== null,
  };
}

export type ProfileAccessEntry = {
  occurredAt: Date;
  /** Organisation name, or null for Venkat Sai staff. */
  organizationName: string | null;
  byVenkatSai: boolean;
  dataCategory: string;
  accessType: string;
};

/**
 * Who looked at the candidate's profile, contact details or documents (transparency for
 * /talent/privacy). Staff names are not disclosed — staff access shows as "Venkat Sai".
 */
export async function listProfileAccessHistory(session: CandidateSession, page: PageQuery): Promise<Paginated<ProfileAccessEntry>> {
  const where = and(eq(dataAccessLogs.subjectUserId, session.user.id), eq(dataAccessLogs.subjectType, "candidate"));
  const [rows, total] = await Promise.all([
    db
      .select({
        occurredAt: dataAccessLogs.occurredAt,
        organizationName: organizations.name,
        actorOrganizationId: dataAccessLogs.actorOrganizationId,
        dataCategory: dataAccessLogs.dataCategory,
        accessType: dataAccessLogs.accessType,
      })
      .from(dataAccessLogs)
      .leftJoin(organizations, eq(organizations.id, dataAccessLogs.actorOrganizationId))
      .where(where)
      .orderBy(desc(dataAccessLogs.occurredAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(dataAccessLogs).where(where),
  ]);
  return paginated(
    rows.map((r) => ({
      occurredAt: r.occurredAt,
      organizationName: r.organizationName ?? null,
      byVenkatSai: r.actorOrganizationId === null,
      dataCategory: r.dataCategory,
      accessType: r.accessType,
    })),
    Number(total[0]?.value ?? 0),
    page,
  );
}

/** Organisations a candidate can pick for the block list (employers and recruitment partners by name). */
export async function searchBlockableOrganizations(session: CandidateSession, query: string): Promise<{ id: string; name: string; type: "employer" | "recruitment_partner" }[]> {
  void session;
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, type: organizations.type })
    .from(organizations)
    .where(
      and(
        isNull(organizations.deletedAt),
        inArray(organizations.type, ["employer", "recruitment_partner"]),
        sql`${organizations.name} ilike ${`%${escapeLike(q)}%`}`,
      ),
    )
    .orderBy(sql`similarity(${organizations.name}, ${q}) desc`, organizations.name)
    .limit(10);
  return rows.filter((r): r is { id: string; name: string; type: "employer" | "recruitment_partner" } => r.type !== "institution");
}

/** Names of the organisations on the candidate's block list (for showing the current list). */
export async function listBlockedOrganizations(session: CandidateSession, blockedIds: readonly string[]): Promise<{ id: string; name: string }[]> {
  void session;
  if (!blockedIds.length) return [];
  return db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, [...blockedIds])).orderBy(organizations.name);
}
