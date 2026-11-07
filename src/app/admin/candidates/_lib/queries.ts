import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { db } from "@/db";
import { applications, batches, courses, enrolments, jobs, organizations, workflowStages } from "@/db/schema";

/**
 * Candidate-scoped reads for the Command Centre candidate record that the recruitment and training
 * modules do not expose by candidate id. Callers have authorised staff (candidates.view +
 * recruitment.view / training.view). Read-only; no contact details.
 * Cross-module need: listApplicationsForStaff({ candidateId }) and an enrolments-by-candidate staff query.
 */

export type CandidateApplicationRow = {
  id: string;
  code: string;
  status: string;
  source: string;
  createdAt: Date;
  lastStageChangedAt: Date;
  stageName: string;
  stageCategory: string;
  jobId: string;
  jobTitle: string;
  jobCode: string;
  employer: string | null;
};

export async function applicationsForCandidate(candidateId: string): Promise<CandidateApplicationRow[]> {
  return db
    .select({
      id: applications.id,
      code: applications.code,
      status: applications.status,
      source: applications.source,
      createdAt: applications.createdAt,
      lastStageChangedAt: applications.lastStageChangedAt,
      stageName: workflowStages.name,
      stageCategory: workflowStages.category,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobCode: jobs.code,
      employer: organizations.name,
    })
    .from(applications)
    .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(eq(applications.candidateId, candidateId))
    .orderBy(desc(applications.lastStageChangedAt))
    .limit(100);
}

export type CandidateEnrolmentRow = { id: string; status: string; resultStatus: string; batchId: string; batchTitle: string; courseTitle: string; provider: string | null; appliedAt: Date };

export async function enrolmentsForCandidate(candidateId: string): Promise<CandidateEnrolmentRow[]> {
  return db
    .select({
      id: enrolments.id,
      status: enrolments.status,
      resultStatus: enrolments.resultStatus,
      batchId: batches.id,
      batchTitle: batches.title,
      courseTitle: courses.title,
      provider: organizations.name,
      appliedAt: enrolments.appliedAt,
    })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .leftJoin(organizations, eq(organizations.id, batches.organizationId))
    .where(eq(enrolments.candidateId, candidateId))
    .orderBy(desc(enrolments.appliedAt))
    .limit(50);
}

/** Venkat Sai batches open for enrolment (staff enrol candidates into Venkat Sai batches only). */
export async function openVenkatSaiBatchOptions(): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: batches.id, title: batches.title, code: batches.code, courseTitle: courses.title, startsOn: batches.startsOn })
    .from(batches)
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(and(isNull(batches.organizationId), inArray(batches.status, ["planned", "open", "full"]), isNull(courses.deletedAt)))
    .orderBy(asc(batches.startsOn))
    .limit(200);
  return rows.map((r) => ({ value: r.id, label: `${r.courseTitle} · ${r.title}`, description: [r.code, r.startsOn ? `starts ${r.startsOn}` : null].filter(Boolean).join(" · ") }));
}
