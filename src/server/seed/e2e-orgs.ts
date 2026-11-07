import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { approvalRequests, batches, courses, enrolments, jobs, organizationDocuments, organizations, partnerLicences } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { decideApproval } from "@/modules/approvals/service";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { createJob } from "@/modules/jobs/job-service";
import { extendJob, publishJob, reopenJob, resumeJob } from "@/modules/jobs/lifecycle-service";
import { setJobRecruitingAgent } from "@/modules/jobs/promotion-service";
import { jobFormSchema, recruitingAgentSchema, type JobFormValues } from "@/modules/jobs/schemas";
import type { JobActor } from "@/modules/jobs/types";
import { setCertificateIssuerAuthorisation, updateInstitutionProfile } from "@/modules/organizations/institution";
import { acceptPartnerAgreement, addPartnerLicence, getActivePartnerAgreement, issuePartnerAgreement, updatePartnerProfile, verifyPartnerLicence } from "@/modules/organizations/partner";
import { institutionProfileSchema, organizationDetailsSchema, partnerAgreementSchema, partnerLicenceSchema, partnerProfileSchema } from "@/modules/organizations/schemas";
import { addOrganizationDocument, createOrganization, submitVerification } from "@/modules/organizations/service";
import { openBatch, createBatch } from "@/modules/training/batches";
import type { CandidateActor as TrainingCandidateActor } from "@/modules/training/candidate";
import { addCourseModule, createCourse, submitCourseForPublication } from "@/modules/training/courses";
import { applyToBatch, confirmEnrolment } from "@/modules/training/enrolments";
import { batchSchema, courseModuleSchema, courseSchema } from "@/modules/training/schemas";

import { ensureMember, isoDay, orgContextFor, storeTestPdf, type SeedLog } from "./e2e-helpers";

type OrgRow = typeof organizations.$inferSelect;
type JobRow = typeof jobs.$inferSelect;

/** Find the E2E organisation by type + name, or create it (owner membership, empty profile) through the service. */
export async function ensureOrganization(type: OrgType, ownerUserId: string, details: Record<string, unknown>): Promise<OrgRow> {
  const input = organizationDetailsSchema.parse(details);
  const [existing] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.type, type), eq(organizations.name, input.name), isNull(organizations.deletedAt)))
    .orderBy(organizations.createdAt)
    .limit(1);
  if (existing) {
    await ensureMember(existing.id, type, ownerUserId, "owner");
    return existing;
  }
  return createOrganization(type, input, { id: ownerUserId, status: "active" });
}

const VERIFICATION_TYPE: Record<OrgType, typeof approvalRequests.$inferSelect["type"]> = {
  employer: "employer_verification",
  recruitment_partner: "partner_verification",
  institution: "institution_verification",
};

async function openVerificationRequest(org: OrgRow): Promise<string | null> {
  const [row] = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(and(eq(approvalRequests.entityId, org.id), eq(approvalRequests.type, VERIFICATION_TYPE[org.type]), inArray(approvalRequests.status, ["pending", "in_review", "escalated"])))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Verify the organisation through the real flow: upload the required documents (test PDFs), submit for
 * verification and approve the request in the approval centre as the E2E Super Admin.
 */
export async function ensureVerified(org: OrgRow, ownerUserId: string, staff: StaffContext, documentTypes: readonly string[], log: SeedLog): Promise<OrgRow> {
  if (org.status === "verified" && (!org.verificationExpiresAt || org.verificationExpiresAt > new Date())) return org;
  let requestId = await openVerificationRequest(org);
  if (!requestId) {
    const ctx = await orgContextFor(ownerUserId, org.id);
    const current = await db
      .select({ documentType: organizationDocuments.documentType })
      .from(organizationDocuments)
      .where(and(eq(organizationDocuments.organizationId, org.id), sql`${organizationDocuments.reviewStatus} <> 'rejected'`));
    for (const documentType of documentTypes) {
      if (current.some((d) => d.documentType === documentType)) continue;
      const fileId = await storeTestPdf({ purpose: "org_document", ownerUserId, organizationId: org.id, name: `e2e-${documentType}.pdf` });
      await addOrganizationDocument(ctx, org.id, {
        documentType: documentType as never,
        fileId,
        title: `E2E test ${documentType.replace(/_/g, " ")}`,
        documentNumber: `E2E-TEST-${documentType.slice(0, 3).toUpperCase()}`,
        expiresOn: isoDay(730),
      });
    }
    await submitVerification(ctx);
    requestId = await openVerificationRequest(org);
  }
  if (!requestId) throw new Error(`E2E seed: no verification request found for ${org.name}`);
  await decideApproval({ requestId, decision: "approved", ctx: staff });
  log(`  verified ${org.name}`);
  const [fresh] = await db.select().from(organizations).where(eq(organizations.id, org.id)).limit(1);
  return fresh!;
}

/** A published, live job of the employer (created by the employer, published by staff); restored if a spec paused / closed it. */
export async function ensurePublishedJob(employer: OrgContext<"employer">, staff: StaffContext, values: JobFormValues & { title: string }, log: SeedLog): Promise<JobRow> {
  const employerActor: JobActor = { kind: "employer", ctx: employer };
  const staffActor: JobActor = { kind: "staff", ctx: staff };
  const [existing] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.organizationId, employer.organization.id), eq(jobs.title, values.title), isNull(jobs.deletedAt)))
    .orderBy(jobs.createdAt)
    .limit(1);
  const dates = { applicationDeadline: isoDay(60), expiresAt: isoDay(90) };
  let job = existing ?? (await createJob(employerActor, jobFormSchema.parse(values)));
  if (job.status === "paused") job = await resumeJob(staffActor, job.id).catch(() => job);
  if (job.status === "closed") job = await reopenJob(staffActor, job.id, dates);
  if (job.status !== "published") job = await publishJob(staffActor, job.id, { infoVerified: true });
  const soon = Date.now() + 14 * 86_400_000;
  if ((job.expiresAt && job.expiresAt.getTime() < soon) || (job.applicationDeadline && job.applicationDeadline.getTime() < soon)) {
    job = await extendJob(staffActor, job.id, dates);
  }
  if (job.status === "paused") job = await resumeJob(staffActor, job.id);
  log(`  job ${job.code} "${job.title}" ${job.status}`);
  return job;
}

/** Record the recruiting agent on an overseas job from a verified india_recruiting_agent licence (CONVENTIONS 15.2). */
export async function ensureRecruitingAgent(job: JobRow, licenceId: string, staff: StaffContext): Promise<void> {
  if (job.recruitingAgentLicenceId === licenceId) return;
  await setJobRecruitingAgent({ kind: "staff", ctx: staff }, recruitingAgentSchema.parse({ id: job.id, mode: "licence", licenceId }));
}

/** Partner profile, a verified Recruiting Agent licence when the partner recruits for overseas jobs, and verification. */
export async function ensurePartner(opts: {
  org: OrgRow;
  ownerUserId: string;
  staff: StaffContext;
  overseas: boolean;
  licenceNumber?: string;
  log: SeedLog;
}): Promise<{ org: OrgRow; licenceId: string | null }> {
  const { ownerUserId, staff, log } = opts;
  const ctx = await orgContextFor<"recruitment_partner">(ownerUserId, opts.org.id);
  if (opts.org.status !== "verified") {
    await updatePartnerProfile(
      ctx,
      opts.org.id,
      partnerProfileSchema.parse({
        businessType: "agency",
        servicesProvided: opts.overseas ? ["candidate_sourcing", "screening", "emigration_clearance"] : ["candidate_sourcing", "screening"],
        specialisations: ["Welding (E2E test data)"],
        industryIds: [],
      }),
    );
  }
  let licenceId: string | null = null;
  if (opts.overseas && opts.licenceNumber) {
    const [licence] = await db
      .select()
      .from(partnerLicences)
      .where(and(eq(partnerLicences.organizationId, opts.org.id), eq(partnerLicences.licenceNumber, opts.licenceNumber), isNull(partnerLicences.deletedAt)))
      .limit(1);
    let row = licence;
    if (!row) {
      const fileId = await storeTestPdf({ purpose: "partner_licence", ownerUserId, organizationId: opts.org.id, name: "e2e-ra-licence.pdf" });
      row = await addPartnerLicence(
        ctx,
        opts.org.id,
        partnerLicenceSchema.parse({
          licenceType: "india_recruiting_agent",
          licenceNumber: opts.licenceNumber,
          issuingAuthority: "E2E test issuing authority",
          issuingCountryCode: "IN",
          validFrom: isoDay(-30),
          validUntil: isoDay(1095),
          fileId,
          holderName: opts.org.name,
          authorisedActivities: [],
          branchOffices: [],
        }),
      );
    }
    if (row.verificationStatus !== "verified") await verifyPartnerLicence(staff, { licenceId: row.id, method: "document_review", notes: "E2E test data" });
    licenceId = row.id;
  }
  const org = await ensureVerified(opts.org, ownerUserId, staff, ["registration_certificate"], log);
  return { org, licenceId };
}

/** An accepted (active) partner agreement, issued by staff and accepted by the owner. */
export async function ensurePartnerAgreement(org: OrgRow, ownerUserId: string, staff: StaffContext): Promise<void> {
  if (await getActivePartnerAgreement(org.id)) return;
  const version = `e2e-${Date.now().toString(36)}`;
  const agreement = await issuePartnerAgreement(
    staff,
    org.id,
    partnerAgreementSchema.parse({
      version,
      title: "Recruitment partner agreement (E2E test)",
      termsHtml: "<p>Test agreement used by automated end-to-end tests. Not a real contract.</p>",
      effectiveFrom: isoDay(-1),
    }),
  );
  const ctx = await orgContextFor(ownerUserId, org.id);
  await acceptPartnerAgreement(ctx, { agreementId: agreement.id, acceptedByName: ctx.user.displayName }, { ipHash: null, userAgent: "e2e-seed" });
}

/** Institution profile, documents, verification and (optionally) certificate-issuer authorisation. */
export async function ensureInstitution(opts: { org: OrgRow; ownerUserId: string; staff: StaffContext; authoriseIssuer: boolean; log: SeedLog }): Promise<OrgRow> {
  const ctx = await orgContextFor<"institution">(opts.ownerUserId, opts.org.id);
  if (opts.org.status !== "verified") {
    await updateInstitutionProfile(
      ctx,
      opts.org.id,
      institutionProfileSchema.parse({ institutionKind: "iti", accreditationBodies: [], aboutHtml: "<p>Test institution used by automated end-to-end tests.</p>" }),
    );
  }
  const org = await ensureVerified(opts.org, opts.ownerUserId, opts.staff, ["registration_certificate", "affiliation"], opts.log);
  if (opts.authoriseIssuer) {
    await setCertificateIssuerAuthorisation(opts.staff, {
      organizationId: org.id,
      authorised: true,
      scope: "E2E test scope: completion certificates for test courses only",
      authorisedUntil: isoDay(730),
    });
  }
  return org;
}

/** A published institution course (approved in the approval centre) with an open batch. */
export async function ensureCourseWithOpenBatch(opts: {
  org: OrgRow;
  ownerUserId: string;
  staff: StaffContext;
  title: string;
  batchTitle: string;
}): Promise<{ courseId: string; batchId: string }> {
  const ctx = await orgContextFor<"institution">(opts.ownerUserId, opts.org.id);
  const [existing] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.organizationId, opts.org.id), eq(courses.title, opts.title), isNull(courses.deletedAt)))
    .limit(1);
  let course = existing;
  if (!course) {
    course = await createCourse(
      ctx,
      courseSchema.parse({
        title: opts.title,
        summary: "Test course used by automated end-to-end tests.",
        category: "welding",
        mode: "in_person",
        durationHours: 40,
        feeType: "free",
        certificationType: "completion_only",
        skillIds: [],
        outcomes: ["Practise basic test welds (E2E test data)"],
        languageCodes: [],
      }),
    );
    await addCourseModule(ctx, course.id, courseModuleSchema.parse({ title: "Safety and equipment (test)", materialFileIds: [] }));
  }
  if (course.status !== "published") {
    const pending = course.status === "pending_approval" ? null : await submitCourseForPublication(ctx, course.id);
    const requestId =
      pending?.approvalRequestId ??
      (
        await db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(and(eq(approvalRequests.entityId, course.id), inArray(approvalRequests.status, ["pending", "in_review", "escalated"])))
          .limit(1)
      )[0]?.id;
    if (requestId) await decideApproval({ requestId, decision: "approved", ctx: opts.staff });
  }
  const [existingBatch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.courseId, course.id), eq(batches.title, opts.batchTitle)))
    .limit(1);
  let batch =
    existingBatch ??
    (await createBatch(
      ctx,
      course.id,
      batchSchema.parse({ title: opts.batchTitle, mode: "in_person", capacity: 25, startsOn: isoDay(45), endsOn: isoDay(90), registrationDeadline: isoDay(40), countryCode: "IN", city: "Visakhapatnam" }),
    ));
  if (batch.status === "planned") batch = await openBatch(ctx, batch.id);
  return { courseId: course.id, batchId: batch.id };
}

/** The learner's enrolment in the batch, confirmed. */
export async function ensureConfirmedEnrolment(opts: { org: OrgRow; ownerUserId: string; batchId: string; learner: TrainingCandidateActor }): Promise<void> {
  const [row] = await db
    .select()
    .from(enrolments)
    .where(and(eq(enrolments.batchId, opts.batchId), eq(enrolments.candidateId, opts.learner.candidateId)))
    .limit(1);
  if (row && ["confirmed", "in_progress", "completed"].includes(row.status)) return;
  const enrolment = row && ["applied", "waitlisted"].includes(row.status) ? row : await applyToBatch(opts.learner, opts.batchId);
  const ctx = await orgContextFor<"institution">(opts.ownerUserId, opts.org.id);
  await confirmEnrolment(ctx, enrolment.id);
}
