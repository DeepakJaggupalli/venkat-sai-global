import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  candidateAttributions,
  candidatePrivacySettings,
  candidateProfiles,
  countries,
  duplicateFlags,
  jobs,
  partnerAssignments,
  partnerSubmissions,
  requirementRequests,
  users,
  type ApplicationRejectionReason,
  type CandidateAttributionStatus,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { encryptField, hmacToken } from "@/lib/crypto";
import { normalizePhone } from "@/lib/validation";
import { audit } from "@/modules/audit";
import { enqueueCandidateRefresh } from "@/modules/candidates/tasks";
import { checkEntitlement, consumeEntitlement, EntitlementError } from "@/modules/commercial/entitlements";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { requireUploadedFile } from "@/modules/files";
import { notify, notifyOrganization, notifyStaff, type NotificationRecipient } from "@/modules/notifications";

import { assertOrg, assertOrgActive, assertStaff, assertUuid } from "./access";
import { createApplicationInTx } from "./applications";
import { insertConsentRecord } from "./consent";
import { isUniqueViolation, notFoundError, rethrowConstraint } from "./errors";
import { recruitmentLinks } from "./links";
import {
  attributionExpiresAt,
  decideAttribution,
  findDuplicateMatches,
  normalizeEmailAddress,
  normalizePassportNumber,
  normalizePersonName,
  passportLast4,
  type AttributionDecision,
  type DuplicateMatch,
  type IdentityCandidate,
  type IdentityProbe,
} from "./matching";
import {
  acceptSubmissionSchema,
  partnerSubmissionSchema,
  rejectSubmissionSchema,
  resolveDuplicateFlagSchema,
  updateAttributionSchema,
  type PartnerSubmissionInput,
} from "./schemas";
import { getAttributionWindowDays } from "./settings";

/**
 * Partner submissions (spec 10.4): a verified partner submits a candidate against one of its active
 * assignments with an attestation of the candidate's consent. The service finds or creates the
 * candidate, runs duplicate detection (email, phone, passport number, passport last 4 + date of
 * birth, normalised name + date of birth), decides attribution (first valid submission wins within
 * the configurable window, default 90 days), and queues a privacy notice to the candidate. Staff
 * review submissions: accepting creates the application (source partner).
 */

/** Text of the partner's consent attestation, stored with the consent record as evidence. */
export const PARTNER_CONSENT_ATTESTATION =
  "The candidate agreed to be submitted to Venkat Sai Global for this requirement and to have their profile shared with the hiring employer.";

const SUBMISSION_CONSTRAINTS = {
  partner_submissions_assignment_candidate_uq: "You have already submitted this candidate for this assignment.",
  partner_submissions_assignment_partner_fk: "This assignment does not belong to your organisation.",
  partner_submissions_consent_chk: "A submission cannot be accepted without the candidate's consent.",
  candidate_attributions_active_uq: "The candidate already has an active partner attribution.",
} as const;

export type SubmissionResult = {
  submissionId: string;
  code: string;
  status: "submitted" | "duplicate";
  candidateId: string;
  /** A new (unclaimed) profile was created for the person. */
  candidateCreated: boolean;
  attribution: AttributionDecision["kind"] | "not_applicable";
};

type AssignmentRow = typeof partnerAssignments.$inferSelect;

// ---------------------------------------------------------------------------
// Identity matching (database side)
// ---------------------------------------------------------------------------

type UserMatch = { userId: string; status: string; candidateId: string | null; candidateDeleted: boolean; matchedOn: ("email" | "phone")[] };

async function findUsersByContact(email: string | null, phone: string | null, tx: DbOrTx): Promise<UserMatch[]> {
  if (!email && !phone) return [];
  const rows = await tx
    .select({ userId: users.id, email: users.email, phone: users.phone, status: users.status, candidateId: candidateProfiles.id, candidateDeletedAt: candidateProfiles.deletedAt })
    .from(users)
    .leftJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
    .where(or(email ? eq(users.email, email) : sql`false`, phone ? eq(users.phone, phone) : sql`false`));
  return rows.map((r) => ({
    userId: r.userId,
    status: r.status,
    candidateId: r.candidateId,
    candidateDeleted: Boolean(r.candidateDeletedAt),
    matchedOn: [...(email && r.email === email ? (["email"] as const) : []), ...(phone && r.phone === phone ? (["phone"] as const) : [])],
  }));
}

/** Existing candidates that could be the same person (passport hash, passport last 4 + DOB, same DOB for name comparison). */
async function findPossibleDuplicates(probe: IdentityProbe, tx: DbOrTx): Promise<IdentityCandidate[]> {
  const conditions = [];
  if (probe.passportHash) conditions.push(eq(candidateProfiles.passportNumberHash, probe.passportHash));
  if (probe.dateOfBirth) conditions.push(eq(candidateProfiles.dateOfBirth, probe.dateOfBirth));
  if (!conditions.length) return [];
  const rows = await tx
    .select({
      candidateId: candidateProfiles.id,
      email: users.email,
      phone: users.phone,
      passportHash: candidateProfiles.passportNumberHash,
      passportLast4: candidateProfiles.passportNumberLast4,
      dateOfBirth: candidateProfiles.dateOfBirth,
      displayName: users.displayName,
      legalName: candidateProfiles.legalName,
    })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(isNull(candidateProfiles.deletedAt), or(...conditions)))
    .limit(500);
  return rows.map((r) => ({
    candidateId: r.candidateId,
    email: r.email,
    phone: r.phone,
    passportHash: r.passportHash,
    passportLast4: r.passportLast4,
    dateOfBirth: r.dateOfBirth,
    names: [r.displayName, ...(r.legalName ? [r.legalName] : [])],
  }));
}

/** Serialise identity decisions for the same contact details (same lock keys as the registration flow). */
async function lockContacts(email: string | null, phone: string | null, tx: DbOrTx): Promise<void> {
  for (const value of [email, phone].filter((v): v is string => Boolean(v)).sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`user-contact:${value}`}, 0))`);
  }
}

async function loadAttributions(candidateIds: string[], tx: DbOrTx) {
  if (!candidateIds.length) return [];
  return tx
    .select({
      id: candidateAttributions.id,
      candidateId: candidateAttributions.candidateId,
      partnerOrganizationId: candidateAttributions.partnerOrganizationId,
      status: candidateAttributions.status,
      expiresAt: candidateAttributions.expiresAt,
    })
    .from(candidateAttributions)
    .where(inArray(candidateAttributions.candidateId, candidateIds));
}

/** Mark active attributions whose window has passed as expired (keeps the "one active" index honest). */
async function expireStaleAttributions(candidateIds: string[], now: Date, tx: DbOrTx): Promise<void> {
  if (!candidateIds.length) return;
  await tx
    .update(candidateAttributions)
    .set({ status: "expired" })
    .where(and(inArray(candidateAttributions.candidateId, candidateIds), eq(candidateAttributions.status, "active"), lte(candidateAttributions.expiresAt, now)));
}

// ---------------------------------------------------------------------------
// Submit (partner)
// ---------------------------------------------------------------------------

async function loadAssignmentForPartner(ctx: OrgContext<"recruitment_partner">, assignmentId: string, tx: DbOrTx): Promise<AssignmentRow & { title: string }> {
  assertUuid(assignmentId, "Assignment");
  const [row] = await tx
    .select({ assignment: partnerAssignments, requirementTitle: requirementRequests.title, jobTitle: jobs.title })
    .from(partnerAssignments)
    .leftJoin(requirementRequests, eq(requirementRequests.id, partnerAssignments.requirementId))
    .leftJoin(jobs, eq(jobs.id, partnerAssignments.jobId))
    .where(and(eq(partnerAssignments.id, assignmentId), eq(partnerAssignments.partnerOrganizationId, ctx.organization.id)))
    .limit(1)
    .for("update", { of: partnerAssignments });
  if (!row) throw notFoundError("Assignment");
  return { ...row.assignment, title: row.jobTitle ?? row.requirementTitle ?? "" };
}

/**
 * Submit a candidate for an assignment (partner.candidates.submit). See the file header for the
 * full flow. A person new to the platform gets an unclaimed account (status pending_verification,
 * no password) and a partner-sourced profile; they are told by email / SMS how to review and claim
 * it (by signing up with the same email or phone).
 */
export async function submitCandidateByPartner(ctx: OrgContext<"recruitment_partner">, assignmentId: string, input: Omit<PartnerSubmissionInput, "assignmentId">): Promise<SubmissionResult> {
  assertOrg(ctx, "partner.candidates.submit");
  assertOrgActive(ctx);
  if (ctx.organization.status !== "verified") throw new ActionError("Your organisation must be verified before you can submit candidates.", { code: "org_not_verified" });
  const data = partnerSubmissionSchema.parse({ ...input, assignmentId });
  const entitlement = await checkEntitlement(ctx.organization.id, "partner_submissions");
  if (!entitlement.allowed) throw new ActionError(entitlement.reason ?? "Your plan does not allow more submissions this period.", { code: "entitlement_exhausted" });

  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const assignment = await loadAssignmentForPartner(ctx, data.assignmentId, tx);
      if (assignment.status !== "active") throw new ActionError("This assignment is not open for submissions.", { code: "assignment_not_active" });
      if (assignment.submissionLimit !== null) {
        const [used] = await tx.select({ value: count() }).from(partnerSubmissions).where(and(eq(partnerSubmissions.assignmentId, assignment.id), ne(partnerSubmissions.status, "withdrawn")));
        if ((used?.value ?? 0) >= assignment.submissionLimit) throw new ActionError("You have reached the submission limit for this assignment.", { code: "submission_limit" });
      }

      // Target job: the assignment's job, or a job of the assignment's requirement chosen by the partner.
      let jobId = assignment.jobId;
      if (data.jobId && data.jobId !== assignment.jobId) {
        const [job] = await tx.select({ id: jobs.id, requirementId: jobs.requirementId, status: jobs.status, deletedAt: jobs.deletedAt }).from(jobs).where(eq(jobs.id, data.jobId)).limit(1);
        if (!job || job.deletedAt || !assignment.requirementId || job.requirementId !== assignment.requirementId) throw notFoundError("Job");
        jobId = job.id;
      }

      const evidenceFileId = data.consent.evidenceFileId
        ? (await requireUploadedFile(data.consent.evidenceFileId, { purposes: ["candidate_document", "application_attachment"], ownerUserId: ctx.user.id, organizationId: ctx.organization.id }, tx)).id
        : null;

      const submissionId = randomUUID();
      let candidateId: string;
      let candidateUserId: string;
      let candidateCreated = false;
      let possibleMatches: DuplicateMatch[] = [];
      let noticeRecipients: NotificationRecipient[] = [];

      if (data.candidate.kind === "existing") {
        assertUuid(data.candidate.candidateId, "Candidate");
        const [row] = await tx
          .select({ id: candidateProfiles.id, userId: candidateProfiles.userId, sourcedBy: candidateProfiles.sourcedByPartnerOrgId, deletedAt: candidateProfiles.deletedAt, userStatus: users.status })
          .from(candidateProfiles)
          .innerJoin(users, eq(users.id, candidateProfiles.userId))
          .where(eq(candidateProfiles.id, data.candidate.candidateId))
          .limit(1);
        if (!row || row.deletedAt || row.userStatus === "closed" || row.userStatus === "suspended") throw notFoundError("Candidate");
        if (row.sourcedBy !== ctx.organization.id) {
          // Partners may only re-submit candidates they sourced or submitted before.
          const [previous] = await tx
            .select({ id: partnerSubmissions.id })
            .from(partnerSubmissions)
            .where(and(eq(partnerSubmissions.candidateId, row.id), eq(partnerSubmissions.partnerOrganizationId, ctx.organization.id)))
            .limit(1);
          if (!previous) throw notFoundError("Candidate");
        }
        candidateId = row.id;
        candidateUserId = row.userId;
        noticeRecipients = [{ userId: row.userId }];
      } else {
        const person = data.candidate;
        const email = normalizeEmailAddress(person.email);
        const phone = person.phone ? normalizePhone(person.phone) : null;
        if (person.phone && !phone) throw new ActionError("Enter a valid phone number with country code.", { fieldErrors: { "candidate.phone": ["Enter a valid phone number"] } });
        for (const [field, code] of [
          ["nationalityCode", person.nationalityCode],
          ["currentCountryCode", person.currentCountryCode],
        ] as const) {
          if (!code) continue;
          const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, code)).limit(1);
          if (!country) throw new ActionError("Choose a valid country.", { fieldErrors: { [`candidate.${field}`]: ["Choose a valid country"] } });
        }
        const passport = normalizePassportNumber(person.passportNumber);
        if (person.passportNumber && !passport) throw new ActionError("Enter a valid passport number.", { fieldErrors: { "candidate.passportNumber": ["Enter a valid passport number"] } });
        const probe: IdentityProbe = {
          email,
          phone,
          passportHash: passport ? hmacToken(passport, "passport") : null,
          passportLast4: passportLast4(passport),
          dateOfBirth: person.dateOfBirth,
          normalizedName: normalizePersonName(person.fullName),
        };

        await lockContacts(email, phone, tx);
        const userMatches = await findUsersByContact(email, phone, tx);
        if (new Set(userMatches.map((m) => m.userId)).size > 1) {
          throw new ActionError("The email address and the phone number belong to different people. Check the details.", { code: "contact_conflict" });
        }
        const existingUser = userMatches[0];
        if (existingUser) {
          if (existingUser.status === "closed" || existingUser.status === "suspended" || existingUser.candidateDeleted) {
            throw new ActionError("This candidate cannot be submitted.", { code: "candidate_unavailable" });
          }
          if (existingUser.candidateId) {
            candidateId = existingUser.candidateId;
          } else {
            // The person has an account (e.g. as an employer member) but no candidate profile yet.
            candidateId = await createPartnerSourcedProfile(tx, ctx, existingUser.userId, person, passport, now);
            candidateCreated = true;
          }
          candidateUserId = existingUser.userId;
          noticeRecipients = [{ userId: existingUser.userId }];
        } else {
          const [user] = await tx
            .insert(users)
            .values({
              email,
              phone,
              displayName: person.fullName,
              status: "pending_verification",
              passwordHash: null,
              locale: person.preferredLocale ?? "en",
              signupSource: "partner_submission",
              preferences: { signupIntent: "candidate", sourcedByPartnerOrgId: ctx.organization.id },
            })
            .returning({ id: users.id });
          candidateUserId = user!.id;
          candidateId = await createPartnerSourcedProfile(tx, ctx, candidateUserId, person, passport, now);
          candidateCreated = true;
          noticeRecipients = [
            ...(email ? [{ email, name: person.fullName, locale: person.preferredLocale }] : []),
            ...(phone ? [{ phone, locale: person.preferredLocale }] : []),
          ];
          await audit({
            action: "user.created_by_partner",
            entityType: "user",
            entityId: candidateUserId,
            organizationId: ctx.organization.id,
            actorUserId: ctx.user.id,
            actorType: "user",
            metadata: { channel: email ? "email" : "phone", submissionId },
            tx,
          });
        }
        possibleMatches = findDuplicateMatches(probe, await findPossibleDuplicates(probe, tx)).filter((m) => m.candidateId !== candidateId && !m.isIdentityMatch);
      }

      // Attribution: the candidate's own attributions decide first; a strong possible duplicate
      // attributed to another partner also makes this a duplicate submission.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`candidate-attribution:${candidateId}`}, 0))`);
      const relatedIds = [candidateId, ...possibleMatches.map((m) => m.candidateId)];
      await expireStaleAttributions(relatedIds, now, tx);
      const attributions = await loadAttributions(relatedIds, tx);
      let decision = decideAttribution(attributions.filter((a) => a.candidateId === candidateId), ctx.organization.id, now);
      let duplicateOfCandidateId: string | null = decision.kind === "duplicate" ? candidateId : null;
      if (decision.kind === "attribute") {
        for (const match of possibleMatches) {
          const matchDecision = decideAttribution(attributions.filter((a) => a.candidateId === match.candidateId), ctx.organization.id, now);
          if (matchDecision.kind === "duplicate") {
            decision = matchDecision;
            duplicateOfCandidateId = match.candidateId;
            break;
          }
        }
      }
      const status = decision.kind === "duplicate" ? "duplicate" : "submitted";

      const consentRecordId = await insertConsentRecord(
        {
          userId: candidateUserId,
          purpose: "partner_submission",
          granted: true,
          source: "partner_submission",
          contextType: "partner_submission",
          contextId: submissionId,
          capturedByUserId: ctx.user.id,
          evidence: {
            method: data.consent.method,
            capturedOn: data.consent.capturedOn,
            evidenceFileId,
            partnerOrganizationId: ctx.organization.id,
            assignmentId: assignment.id,
            attestation: PARTNER_CONSENT_ATTESTATION,
          },
        },
        tx,
      );

      const code = await nextCode("SUB", { tx });
      await tx.insert(partnerSubmissions).values({
        id: submissionId,
        code,
        assignmentId: assignment.id,
        partnerOrganizationId: ctx.organization.id,
        submittedByUserId: ctx.user.id,
        candidateId,
        jobId,
        status,
        partnerNotes: data.partnerNotes,
        consentRecordId,
        duplicateOfCandidateId,
        createdAt: now,
      });

      if (decision.kind === "attribute") {
        const windowDays = await getAttributionWindowDays(tx);
        await tx.insert(candidateAttributions).values({
          candidateId,
          partnerOrganizationId: ctx.organization.id,
          firstSubmissionId: submissionId,
          firstSubmittedAt: now,
          expiresAt: attributionExpiresAt(now, windowDays),
          status: "active",
        });
      }

      for (const match of possibleMatches) {
        await tx
          .insert(duplicateFlags)
          .values({ candidateId, possibleDuplicateCandidateId: match.candidateId, matchedOn: match.matchedOn, score: match.score, source: "partner_submission", partnerSubmissionId: submissionId })
          .onConflictDoNothing();
      }

      await consumeEntitlement(ctx.organization.id, "partner_submissions", { reference: { type: "partner_submission", id: submissionId }, actorUserId: ctx.user.id, tx });

      await notifyStaff(
        {
          event: "partner.submission_received",
          permission: "recruitment.manage",
          data: { submissionCode: code, partnerName: ctx.organization.name, assignmentTitle: assignment.title, duplicate: status === "duplicate", possibleDuplicates: possibleMatches.length },
          link: recruitmentLinks.staffPartnerSubmission(submissionId),
          dedupeKey: `partner-submission-received:${submissionId}`,
        },
        { tx },
      );
      if (noticeRecipients.length) {
        await notify(
          {
            event: "candidate.partner_submission_notice",
            recipients: noticeRecipients,
            data: { partnerName: ctx.organization.name, opportunityTitle: assignment.title, isNewProfile: candidateCreated && data.candidate.kind === "new", submissionCode: code },
            link: candidateCreated && data.candidate.kind === "new" ? recruitmentLinks.candidateClaimProfile() : recruitmentLinks.candidateApplications(),
            dedupeKey: `partner-submission-notice:${submissionId}`,
          },
          { tx },
        );
      }
      await audit({
        action: "partner_submission.created",
        entityType: "partner_submission",
        entityId: submissionId,
        organizationId: ctx.organization.id,
        actorUserId: ctx.user.id,
        actorType: "user",
        metadata: {
          code,
          assignmentId: assignment.id,
          candidateId,
          candidateCreated,
          status,
          attribution: decision.kind,
          possibleDuplicates: possibleMatches.map((m) => ({ candidateId: m.candidateId, matchedOn: m.matchedOn, score: m.score })),
        },
        tx,
      });
      return { submissionId, code, status, candidateId, candidateCreated, attribution: decision.kind };
    });
  } catch (error) {
    if (error instanceof EntitlementError) throw new ActionError(error.message, { code: "entitlement_exhausted" });
    if (isUniqueViolation(error, "partner_submissions_assignment_candidate_uq")) throw new ActionError(SUBMISSION_CONSTRAINTS.partner_submissions_assignment_candidate_uq, { code: "duplicate_submission" });
    rethrowConstraint(error, SUBMISSION_CONSTRAINTS);
  }
}

type NewPersonInput = Extract<PartnerSubmissionInput["candidate"], { kind: "new" }>;

async function createPartnerSourcedProfile(
  tx: DbOrTx,
  ctx: OrgContext<"recruitment_partner">,
  userId: string,
  person: NewPersonInput,
  passport: string | null,
  now: Date,
): Promise<string> {
  let resumeFileId: string | null = null;
  if (person.resumeFileId) {
    resumeFileId = (await requireUploadedFile(person.resumeFileId, { purposes: ["resume"], ownerUserId: ctx.user.id, organizationId: ctx.organization.id }, tx)).id;
  }
  const today = now.toISOString().slice(0, 10);
  const [profile] = await tx
    .insert(candidateProfiles)
    .values({
      userId,
      headline: person.headline ?? null,
      currentJobTitle: person.currentJobTitle ?? null,
      totalExperienceMonths: person.totalExperienceMonths ?? null,
      currentCountryCode: person.currentCountryCode ?? null,
      city: person.city ?? null,
      nationalityCode: person.nationalityCode ?? null,
      dateOfBirth: person.dateOfBirth ?? null,
      passportStatus: passport ? (person.passportExpiry && person.passportExpiry < today ? "expired" : "valid") : null,
      passportNumberEncrypted: passport ? encryptField(passport) : null,
      passportNumberLast4: passportLast4(passport),
      passportNumberHash: passport ? hmacToken(passport, "passport") : null,
      passportExpiry: passport ? (person.passportExpiry ?? null) : null,
      resumeFileId,
      resumeUpdatedAt: resumeFileId ? now : null,
      visibility: "venkat_sai_only",
      source: "partner",
      sourcedByPartnerOrgId: ctx.organization.id,
      createdByUserId: ctx.user.id,
    })
    .returning({ id: candidateProfiles.id });
  // Partner submissions are allowed because the partner recorded the candidate's consent; every other setting keeps its protective default.
  await tx.insert(candidatePrivacySettings).values({ candidateId: profile!.id, allowPartnerSubmissions: true }).onConflictDoNothing();
  // Completeness, search text and verification level are maintained by the candidates module.
  await enqueueCandidateRefresh(profile!.id, tx);
  await audit({
    action: "candidate.profile_created",
    entityType: "candidate",
    entityId: profile!.id,
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    actorType: "user",
    metadata: { source: "partner", sourcedByPartnerOrgId: ctx.organization.id, onBehalf: true },
    tx,
  });
  return profile!.id;
}

/** The partner withdraws a submission that has not been accepted or rejected yet. */
export async function withdrawPartnerSubmission(ctx: OrgContext<"recruitment_partner">, submissionId: string): Promise<void> {
  assertOrg(ctx, "partner.candidates.submit");
  assertUuid(submissionId, "Submission");
  await db.transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(partnerSubmissions)
      .where(and(eq(partnerSubmissions.id, submissionId), eq(partnerSubmissions.partnerOrganizationId, ctx.organization.id)))
      .limit(1)
      .for("update");
    if (!submission) throw notFoundError("Submission");
    if (!["submitted", "under_review", "duplicate"].includes(submission.status)) throw new ActionError("This submission can no longer be withdrawn.", { code: "submission_status" });
    await tx.update(partnerSubmissions).set({ status: "withdrawn", withdrawnAt: new Date() }).where(eq(partnerSubmissions.id, submission.id));
    // An attribution won by this submission alone is released.
    await tx
      .update(candidateAttributions)
      .set({ status: "revoked", resolutionNotes: "Submission withdrawn by the partner", resolvedAt: new Date(), resolvedByUserId: ctx.user.id })
      .where(and(eq(candidateAttributions.firstSubmissionId, submission.id), eq(candidateAttributions.status, "active")));
    await audit({
      action: "partner_submission.withdrawn",
      entityType: "partner_submission",
      entityId: submission.id,
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      actorType: "user",
      metadata: { code: submission.code },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Staff review
// ---------------------------------------------------------------------------

async function loadSubmissionForReview(submissionId: string, tx: DbOrTx) {
  assertUuid(submissionId, "Submission");
  const [row] = await tx
    .select({ submission: partnerSubmissions, assignment: partnerAssignments })
    .from(partnerSubmissions)
    .innerJoin(partnerAssignments, eq(partnerAssignments.id, partnerSubmissions.assignmentId))
    .where(eq(partnerSubmissions.id, submissionId))
    .limit(1)
    .for("update", { of: partnerSubmissions });
  if (!row) throw notFoundError("Submission");
  return row;
}

async function notifyPartnerOfStatus(
  tx: DbOrTx,
  submission: typeof partnerSubmissions.$inferSelect,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await notifyOrganization(
    {
      event: "partner.submission_status_changed",
      organizationId: submission.partnerOrganizationId,
      permission: "partner.submissions.view",
      data: { submissionCode: submission.code, status, ...extra },
      link: recruitmentLinks.partnerSubmission(submission.id),
      dedupeKey: `partner-submission-status:${submission.id}:${status}`,
    },
    { tx },
  );
}

/** Staff take a submission into review (the partner sees "under review"). */
export async function startSubmissionReview(ctx: StaffContext, submissionId: string): Promise<void> {
  assertStaff(ctx, "recruitment.manage");
  await db.transaction(async (tx) => {
    const { submission } = await loadSubmissionForReview(submissionId, tx);
    if (submission.status !== "submitted") return;
    await tx.update(partnerSubmissions).set({ status: "under_review" }).where(eq(partnerSubmissions.id, submission.id));
    await notifyPartnerOfStatus(tx, submission, "under_review");
    await audit({ action: "partner_submission.under_review", entityType: "partner_submission", entityId: submission.id, organizationId: submission.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { code: submission.code }, tx });
  });
}

/**
 * Accept a submission: creates the application (source partner, credited to the partner) for the
 * submission's job — or `jobId` when the assignment covers a requirement — and tells the partner.
 */
export async function acceptPartnerSubmission(
  ctx: StaffContext,
  input: { submissionId: string; jobId?: string | null; reviewNotes?: string | null; partnerFeedback?: string | null },
): Promise<{ applicationId: string; applicationCode: string }> {
  assertStaff(ctx, "recruitment.manage");
  const data = acceptSubmissionSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const { submission, assignment } = await loadSubmissionForReview(data.submissionId, tx);
      if (submission.status === "duplicate") throw new ActionError("Resolve the duplicate before accepting this submission.", { code: "submission_duplicate" });
      if (submission.status !== "submitted" && submission.status !== "under_review") throw new ActionError("This submission has already been reviewed.", { code: "submission_status" });
      if (!submission.consentRecordId) throw new ActionError(SUBMISSION_CONSTRAINTS.partner_submissions_consent_chk, { code: "no_consent" });
      if (assignment.status === "revoked") throw new ActionError("The assignment was revoked.", { code: "assignment_revoked" });

      let jobId = submission.jobId ?? assignment.jobId;
      if (data.jobId && data.jobId !== jobId) {
        const [job] = await tx.select({ id: jobs.id, requirementId: jobs.requirementId }).from(jobs).where(eq(jobs.id, data.jobId)).limit(1);
        if (!job || (assignment.jobId !== job.id && (!assignment.requirementId || job.requirementId !== assignment.requirementId))) {
          throw new ActionError("Choose a job of this assignment's requirement.", { fieldErrors: { jobId: ["Choose a job of this requirement"] } });
        }
        jobId = job.id;
      }
      if (!jobId) throw new ActionError("Choose the job for this candidate.", { fieldErrors: { jobId: ["Choose a job"] } });

      const created = await createApplicationInTx(
        tx,
        {
          kind: "partner",
          actor: { kind: "staff", ctx },
          partnerOrganizationId: submission.partnerOrganizationId,
          partnerUserId: submission.submittedByUserId,
          partnerSubmissionId: submission.id,
          partnerSubmissionCode: submission.code,
          partnerConsentRecordId: submission.consentRecordId,
        },
        { jobId, candidateId: submission.candidateId, internalNote: data.reviewNotes },
      );
      await tx
        .update(partnerSubmissions)
        .set({
          status: "accepted",
          applicationId: created.id,
          jobId,
          reviewNotes: data.reviewNotes ?? submission.reviewNotes,
          partnerFeedback: data.partnerFeedback,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(partnerSubmissions.id, submission.id));
      await notifyPartnerOfStatus(tx, submission, "accepted", { feedback: data.partnerFeedback, applicationCode: created.code });
      await audit({
        action: "partner_submission.accepted",
        entityType: "partner_submission",
        entityId: submission.id,
        organizationId: submission.partnerOrganizationId,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { code: submission.code, applicationId: created.id, jobId },
        tx,
      });
      return { applicationId: created.id, applicationCode: created.code };
    });
  } catch (error) {
    rethrowConstraint(error, SUBMISSION_CONSTRAINTS);
  }
}

/** Reject a submission with a structured, job-related reason; the partner sees the reason and `partnerFeedback`. */
export async function rejectPartnerSubmission(
  ctx: StaffContext,
  input: { submissionId: string; rejectionReasonCode: ApplicationRejectionReason; partnerFeedback?: string | null; reviewNotes?: string | null },
): Promise<void> {
  assertStaff(ctx, "recruitment.manage");
  const data = rejectSubmissionSchema.parse(input);
  await db.transaction(async (tx) => {
    const { submission } = await loadSubmissionForReview(data.submissionId, tx);
    if (!["submitted", "under_review", "duplicate"].includes(submission.status)) throw new ActionError("This submission has already been reviewed.", { code: "submission_status" });
    await tx
      .update(partnerSubmissions)
      .set({ status: "rejected", rejectionReasonCode: data.rejectionReasonCode, partnerFeedback: data.partnerFeedback, reviewNotes: data.reviewNotes ?? submission.reviewNotes, reviewedByUserId: ctx.user.id, reviewedAt: new Date() })
      .where(eq(partnerSubmissions.id, submission.id));
    // A job-fit rejection keeps the partner's attribution of the candidate; a duplicate does not.
    if (data.rejectionReasonCode === "duplicate") {
      await tx
        .update(candidateAttributions)
        .set({ status: "revoked", resolutionNotes: "Submission rejected as a duplicate", resolvedAt: new Date(), resolvedByUserId: ctx.user.id })
        .where(and(eq(candidateAttributions.firstSubmissionId, submission.id), eq(candidateAttributions.status, "active")));
    }
    await notifyPartnerOfStatus(tx, submission, "rejected", { reason: data.rejectionReasonCode, feedback: data.partnerFeedback });
    await audit({
      action: "partner_submission.rejected",
      entityType: "partner_submission",
      entityId: submission.id,
      organizationId: submission.partnerOrganizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { code: submission.code, reason: data.rejectionReasonCode },
      tx,
    });
  });
}

/** Staff decided a "duplicate" submission should be reviewed after all (e.g. after resolving the attribution). */
export async function reopenDuplicateSubmission(ctx: StaffContext, input: { submissionId: string; reviewNotes?: string | null }): Promise<void> {
  assertStaff(ctx, ["recruitment.manage", "partners.manage"]);
  await db.transaction(async (tx) => {
    const { submission } = await loadSubmissionForReview(input.submissionId, tx);
    if (submission.status !== "duplicate") throw new ActionError("This submission is not marked as a duplicate.", { code: "submission_status" });
    await tx
      .update(partnerSubmissions)
      .set({ status: "under_review", duplicateOfCandidateId: null, reviewNotes: input.reviewNotes?.trim() || submission.reviewNotes })
      .where(eq(partnerSubmissions.id, submission.id));
    await notifyPartnerOfStatus(tx, submission, "under_review");
    await audit({ action: "partner_submission.duplicate_cleared", entityType: "partner_submission", entityId: submission.id, organizationId: submission.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { code: submission.code }, tx });
  });
}

/** Resolve a possible-duplicate flag (merging profiles is done by the candidates module). */
export async function resolveDuplicateFlag(ctx: StaffContext, input: { flagId: string; status: "confirmed_duplicate" | "not_duplicate" | "merged"; resolutionNotes?: string | null }): Promise<void> {
  assertStaff(ctx, "candidates.manage");
  const data = resolveDuplicateFlagSchema.parse(input);
  const [row] = await db
    .update(duplicateFlags)
    .set({ status: data.status, resolutionNotes: data.resolutionNotes, resolvedByUserId: ctx.user.id, resolvedAt: new Date() })
    .where(and(eq(duplicateFlags.id, data.flagId), eq(duplicateFlags.status, "open")))
    .returning({ id: duplicateFlags.id, candidateId: duplicateFlags.candidateId });
  if (!row) throw notFoundError("Open duplicate flag");
  await audit({ action: `duplicate_flag.${data.status}`, entityType: "candidate", entityId: row.candidateId, actorUserId: ctx.user.id, actorType: "staff", metadata: { flagId: row.id, notes: data.resolutionNotes } });
}

/** Staff resolve attribution disputes (partners.manage): activate, dispute, revoke or expire an attribution with notes. */
export async function updateAttribution(ctx: StaffContext, input: { attributionId: string; status: CandidateAttributionStatus; resolutionNotes: string }): Promise<void> {
  assertStaff(ctx, "partners.manage");
  const data = updateAttributionSchema.parse(input);
  try {
    await db.transaction(async (tx) => {
      const [attribution] = await tx.select().from(candidateAttributions).where(eq(candidateAttributions.id, data.attributionId)).limit(1).for("update");
      if (!attribution) throw notFoundError("Attribution");
      if (data.status === "active" && attribution.expiresAt && attribution.expiresAt.getTime() <= Date.now()) {
        throw new ActionError("This attribution's window has ended; it cannot be made active again.", { code: "attribution_expired" });
      }
      await tx
        .update(candidateAttributions)
        .set({ status: data.status, resolutionNotes: data.resolutionNotes, resolvedByUserId: ctx.user.id, resolvedAt: new Date() })
        .where(eq(candidateAttributions.id, attribution.id));
      await audit({
        action: "candidate_attribution.updated",
        entityType: "candidate",
        entityId: attribution.candidateId,
        organizationId: attribution.partnerOrganizationId,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { attributionId: attribution.id, from: attribution.status, to: data.status, notes: data.resolutionNotes },
        tx,
      });
    });
  } catch (error) {
    rethrowConstraint(error, SUBMISSION_CONSTRAINTS);
  }
}

/** Expire active attributions whose window has passed (task). Returns how many expired. */
export async function expireAttributions(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(candidateAttributions)
    .set({ status: "expired" })
    .where(and(eq(candidateAttributions.status, "active"), lte(candidateAttributions.expiresAt, now)))
    .returning({ id: candidateAttributions.id });
  if (rows.length) await audit({ action: "candidate_attribution.expired", entityType: "candidate_attribution", actorType: "system", metadata: { count: rows.length } });
  return rows.length;
}
