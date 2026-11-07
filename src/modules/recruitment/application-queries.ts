import "server-only";

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  applicationAnswers,
  applicationStageHistory,
  applications,
  candidatePrivacySettings,
  candidateProfiles,
  jobs,
  organizations,
  partnerSubmissions,
  placements,
  requirementRequests,
  users,
  workflowStages,
  type ApplicationKnockoutFlag,
  type ApplicationSource,
  type ApplicationStatus,
  type ScreeningAnswerValue,
  type WorkflowStageCategory,
  type WorkflowStageTranslations,
} from "@/db/schema";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";

import { assertOrg, assertStaff, isUuid, loadApplicationScope, loadWorkflowStages, publicEmployerName, type StageRow } from "./access";
import { loadCandidateCards, type CandidateCard } from "./candidate-cards";
import { notFoundError } from "./errors";
import { listInterviewsForApplication, listInterviewsForCandidate, type CandidateInterviewView, type InterviewView } from "./interviews";
import { listApplicationNotes, type ApplicationNoteView } from "./notes";
import { listOffersForApplication, listOffersForCandidate, type CandidateOfferView, type OfferView } from "./offers";
import { getMobilisationForCandidate, type CandidateMobilisationView } from "./mobilisation";
import { getPlacementForApplication, type PlacementView } from "./placements";
import type { CandidateActor, EmployerActor, StaffActor } from "./types";
import { maskPersonName } from "./visibility";
import {
  allowedTargetStages,
  isFinalStage,
  PIPELINE_COLUMNS,
  pipelineColumnForStage,
  REQUIREMENT_PIPELINE_COLUMNS,
  requirementPipelineColumn,
  type PipelineColumnKey,
  type RequirementPipelineColumnKey,
} from "./workflow";

/**
 * Application read models, scoped per audience:
 *  - candidates: own applications, candidate labels and candidate-visible history only;
 *  - employers: shared applications of their own jobs, pipeline board by PIPELINE_COLUMNS;
 *  - staff: everything, with filters (requirement, job, stage, partner, dates).
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type StageView = { id: string; key: string; name: string; category: WorkflowStageCategory; sortOrder: number; isTerminal: boolean; isActive: boolean };

export type CandidateStageView = {
  key: string;
  label: string;
  description: string | null;
  translations: WorkflowStageTranslations;
  category: WorkflowStageCategory;
  isFinal: boolean;
};

const toStageView = (s: StageRow): StageView => ({ id: s.id, key: s.key, name: s.name, category: s.category, sortOrder: s.sortOrder, isTerminal: s.isTerminal, isActive: s.isActive });

const toCandidateStageView = (s: Pick<StageRow, "key" | "candidateLabel" | "candidateDescription" | "candidateTranslations" | "category" | "isTerminal">): CandidateStageView => ({
  key: s.key,
  label: s.candidateLabel,
  description: s.candidateDescription,
  translations: s.candidateTranslations,
  category: s.category,
  isFinal: isFinalStage(s),
});

export type { CandidateCard };

// ---------------------------------------------------------------------------
// Candidate (People Portal)
// ---------------------------------------------------------------------------

export type CandidateApplicationListItem = {
  id: string;
  code: string;
  status: ApplicationStatus;
  submittedAt: Date;
  lastStageChangedAt: Date;
  stage: CandidateStageView;
  job: { id: string; slug: string; code: string; title: string; employerName: string; city: string | null; countryCode: string | null; isOverseas: boolean };
  hasOpenOffer: boolean;
  nextInterviewAt: Date | null;
  canWithdraw: boolean;
};

export type CandidateApplicationDetail = CandidateApplicationListItem & {
  coverLetter: string | null;
  resumeFileId: string | null;
  expectedSalary: { amountMinor: number; currency: string; period: string } | null;
  withdrawnAt: Date | null;
  withdrawalReason: string | null;
  answers: { question: string; answer: ScreeningAnswerValue }[];
  /** Candidate-visible history: stage labels and notes written for the candidate, oldest first. */
  history: { stage: CandidateStageView; note: string | null; at: Date }[];
  interviews: CandidateInterviewView[];
  offers: CandidateOfferView[];
  placement: { code: string; status: string; placedOn: string; joinedOn: string | null } | null;
  mobilisation: CandidateMobilisationView | null;
};

const candidateListSelection = {
  id: applications.id,
  code: applications.code,
  status: applications.status,
  createdAt: applications.createdAt,
  lastStageChangedAt: applications.lastStageChangedAt,
  stage: {
    key: workflowStages.key,
    candidateLabel: workflowStages.candidateLabel,
    candidateDescription: workflowStages.candidateDescription,
    candidateTranslations: workflowStages.candidateTranslations,
    category: workflowStages.category,
    isTerminal: workflowStages.isTerminal,
  },
  job: {
    id: jobs.id,
    slug: jobs.slug,
    code: jobs.code,
    title: jobs.title,
    city: jobs.city,
    countryCode: jobs.countryCode,
    isOverseas: jobs.isOverseas,
    organizationId: jobs.organizationId,
    isConfidential: jobs.isConfidential,
    confidentialEmployerName: jobs.confidentialEmployerName,
  },
  organizationName: organizations.name,
  hasOpenOffer: sql<boolean>`exists (select 1 from offers o where o.application_id = ${applications.id} and o.status = 'issued')`,
  nextInterviewAt: sql<Date | null>`(select min(i.scheduled_start) from interviews i where i.application_id = ${applications.id} and i.status in ('scheduled', 'rescheduled') and i.scheduled_start > now())`,
};

type CandidateListRow = {
  id: string;
  code: string;
  status: ApplicationStatus;
  createdAt: Date;
  lastStageChangedAt: Date;
  stage: Pick<StageRow, "key" | "candidateLabel" | "candidateDescription" | "candidateTranslations" | "category" | "isTerminal">;
  job: { id: string; slug: string; code: string; title: string; city: string | null; countryCode: string | null; isOverseas: boolean; organizationId: string | null; isConfidential: boolean; confidentialEmployerName: string | null };
  organizationName: string | null;
  hasOpenOffer: boolean;
  nextInterviewAt: Date | string | null;
};

function toCandidateListItem(r: CandidateListRow): CandidateApplicationListItem {
  const stage = toCandidateStageView(r.stage);
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    submittedAt: r.createdAt,
    lastStageChangedAt: r.lastStageChangedAt,
    stage,
    job: {
      id: r.job.id,
      slug: r.job.slug,
      code: r.job.code,
      title: r.job.title,
      employerName: publicEmployerName(r.job, r.organizationName),
      city: r.job.city,
      countryCode: r.job.countryCode,
      isOverseas: r.job.isOverseas,
    },
    hasOpenOffer: Boolean(r.hasOpenOffer),
    nextInterviewAt: r.nextInterviewAt ? new Date(r.nextInterviewAt) : null,
    canWithdraw: !stage.isFinal,
  };
}

function candidateListQuery() {
  return db
    .select(candidateListSelection)
    .from(applications)
    .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId));
}

/** The candidate's applications, newest first. `status: "open"` = active, `"closed"` = everything else. */
export async function listApplicationsForCandidate(actor: CandidateActor, filters: { status?: "open" | "closed" | ApplicationStatus } = {}, page: PageQuery): Promise<Paginated<CandidateApplicationListItem>> {
  const where: SQL[] = [eq(applications.candidateId, actor.candidateId)];
  if (filters.status === "open") where.push(eq(applications.status, "active"));
  else if (filters.status === "closed") where.push(sql`${applications.status} <> 'active'`);
  else if (filters.status) where.push(eq(applications.status, filters.status));
  const condition = and(...where);
  const [rows, total] = await Promise.all([
    candidateListQuery().where(condition).orderBy(desc(applications.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(applications).where(condition),
  ]);
  return paginated(rows.map(toCandidateListItem), total[0]?.value ?? 0, page);
}

/** One of the candidate's applications with everything the candidate may see (never internal notes, ratings, flags or feedback). */
export async function getApplicationForCandidate(actor: CandidateActor, applicationId: string): Promise<CandidateApplicationDetail> {
  if (!isUuid(applicationId)) throw notFoundError("Application");
  const [row] = await candidateListQuery()
    .where(and(eq(applications.id, applicationId), eq(applications.candidateId, actor.candidateId)))
    .limit(1);
  if (!row) throw notFoundError("Application");
  const [app] = await db
    .select({
      coverLetter: applications.coverLetter,
      resumeFileId: applications.resumeFileId,
      expectedSalaryMinor: applications.expectedSalaryMinor,
      expectedSalaryCurrency: applications.expectedSalaryCurrency,
      expectedSalaryPeriod: applications.expectedSalaryPeriod,
      withdrawnAt: applications.withdrawnAt,
      withdrawalReason: applications.withdrawalReason,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  const [answers, history, interviews, offers, placement, mobilisation] = await Promise.all([
    db.select({ snapshot: applicationAnswers.questionSnapshot, answer: applicationAnswers.answer }).from(applicationAnswers).where(eq(applicationAnswers.applicationId, applicationId)).orderBy(asc(applicationAnswers.createdAt)),
    db
      .select({
        note: applicationStageHistory.candidateVisibleNote,
        at: applicationStageHistory.createdAt,
        stage: {
          key: workflowStages.key,
          candidateLabel: workflowStages.candidateLabel,
          candidateDescription: workflowStages.candidateDescription,
          candidateTranslations: workflowStages.candidateTranslations,
          category: workflowStages.category,
          isTerminal: workflowStages.isTerminal,
        },
      })
      .from(applicationStageHistory)
      .innerJoin(workflowStages, eq(workflowStages.id, applicationStageHistory.toStageId))
      .where(eq(applicationStageHistory.applicationId, applicationId))
      .orderBy(asc(applicationStageHistory.createdAt)),
    listInterviewsForCandidate(actor, { applicationId }),
    listOffersForCandidate(actor, { applicationId }),
    db.select({ code: placements.code, status: placements.status, placedOn: placements.placedOn, joinedOn: placements.joinedOn }).from(placements).where(eq(placements.applicationId, applicationId)).limit(1),
    getMobilisationForCandidate(actor, applicationId),
  ]);
  return {
    ...toCandidateListItem(row),
    coverLetter: app?.coverLetter ?? null,
    resumeFileId: app?.resumeFileId ?? null,
    expectedSalary:
      app?.expectedSalaryMinor !== null && app?.expectedSalaryMinor !== undefined && app.expectedSalaryCurrency && app.expectedSalaryPeriod
        ? { amountMinor: app.expectedSalaryMinor, currency: app.expectedSalaryCurrency, period: app.expectedSalaryPeriod }
        : null,
    withdrawnAt: app?.withdrawnAt ?? null,
    withdrawalReason: app?.withdrawalReason ?? null,
    answers: answers.map((a) => ({ question: a.snapshot.question, answer: a.answer })),
    history: history.map((h) => ({ stage: toCandidateStageView(h.stage), note: h.note, at: h.at })),
    interviews,
    offers,
    placement: placement[0] ?? null,
    mobilisation,
  };
}

// ---------------------------------------------------------------------------
// Pipeline cards (employer / staff)
// ---------------------------------------------------------------------------

export type PipelineCard = {
  applicationId: string;
  code: string;
  candidateId: string;
  displayName: string;
  nameMasked: boolean;
  photoFileId: string | null;
  headline: string | null;
  currentJobTitle: string | null;
  city: string | null;
  countryCode: string | null;
  totalExperienceMonths: number | null;
  skills: string[];
  verificationLevel: string;
  stage: { id: string; key: string; name: string; category: WorkflowStageCategory };
  column: PipelineColumnKey;
  status: ApplicationStatus;
  rating: number | null;
  isShortlisted: boolean;
  knockoutFlagCount: number;
  /** Employers see "direct" or "venkat_sai" (the sourcing partner is never disclosed to employers). */
  source: ApplicationSource | "venkat_sai";
  appliedAt: Date;
  lastStageChangedAt: Date;
};

type PipelineViewer = { kind: "staff" } | { kind: "employer"; organizationId: string };

const cardSelection = {
  id: applications.id,
  code: applications.code,
  candidateId: applications.candidateId,
  status: applications.status,
  rating: applications.rating,
  isShortlisted: applications.isShortlisted,
  knockoutFlags: applications.knockoutFlags,
  source: applications.source,
  consentToShareAt: applications.consentToShareAt,
  createdAt: applications.createdAt,
  lastStageChangedAt: applications.lastStageChangedAt,
  stage: { id: workflowStages.id, key: workflowStages.key, name: workflowStages.name, category: workflowStages.category },
  displayName: users.displayName,
  photoFileId: candidateProfiles.photoFileId,
  headline: candidateProfiles.headline,
  currentJobTitle: candidateProfiles.currentJobTitle,
  city: candidateProfiles.city,
  countryCode: candidateProfiles.currentCountryCode,
  totalExperienceMonths: candidateProfiles.totalExperienceMonths,
  skills: candidateProfiles.skillNamesCache,
  verificationLevel: candidateProfiles.verificationLevel,
  showPhoto: candidatePrivacySettings.showPhoto,
};

type CardQueryRow = {
  id: string;
  code: string;
  candidateId: string;
  status: ApplicationStatus;
  rating: number | null;
  isShortlisted: boolean;
  knockoutFlags: ApplicationKnockoutFlag[];
  source: ApplicationSource;
  consentToShareAt: Date | null;
  createdAt: Date;
  lastStageChangedAt: Date;
  stage: { id: string; key: string; name: string; category: WorkflowStageCategory };
  displayName: string;
  photoFileId: string | null;
  headline: string | null;
  currentJobTitle: string | null;
  city: string | null;
  countryCode: string | null;
  totalExperienceMonths: number | null;
  skills: string[];
  verificationLevel: string;
  showPhoto: boolean | null;
};

function cardQuery() {
  return db
    .select(cardSelection)
    .from(applications)
    .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id));
}

function toPipelineCard(r: CardQueryRow, viewer: PipelineViewer): PipelineCard {
  // Applications carry the candidate's consent to share with this employer; without it, mask.
  const unmasked = viewer.kind === "staff" || Boolean(r.consentToShareAt);
  return {
    applicationId: r.id,
    code: r.code,
    candidateId: r.candidateId,
    displayName: unmasked ? r.displayName : maskPersonName(r.displayName),
    nameMasked: !unmasked,
    photoFileId: viewer.kind === "staff" || r.showPhoto ? r.photoFileId : null,
    headline: r.headline,
    currentJobTitle: r.currentJobTitle,
    city: r.city,
    countryCode: r.countryCode,
    totalExperienceMonths: r.totalExperienceMonths,
    skills: r.skills,
    verificationLevel: r.verificationLevel,
    stage: r.stage,
    column: pipelineColumnForStage(r.stage),
    status: r.status,
    rating: r.rating,
    isShortlisted: r.isShortlisted,
    knockoutFlagCount: r.knockoutFlags.length,
    source: viewer.kind === "staff" ? r.source : r.source === "direct" ? "direct" : "venkat_sai",
    appliedAt: r.createdAt,
    lastStageChangedAt: r.lastStageChangedAt,
  };
}

async function loadJobForPipeline(actor: StaffActor | EmployerActor, jobId: string) {
  if (!isUuid(jobId)) throw notFoundError("Job");
  if (actor.kind === "staff") assertStaff(actor.ctx, ["recruitment.view", "recruitment.manage"], "any");
  else assertOrg(actor.ctx, "employer.pipeline.view");
  const [job] = await db
    .select({ id: jobs.id, code: jobs.code, title: jobs.title, status: jobs.status, organizationId: jobs.organizationId, requirementId: jobs.requirementId, workflowId: jobs.workflowId, deletedAt: jobs.deletedAt })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job || (actor.kind === "employer" && (job.organizationId !== actor.ctx.organization.id || job.deletedAt))) throw notFoundError("Job");
  const viewer: PipelineViewer = actor.kind === "staff" ? { kind: "staff" } : { kind: "employer", organizationId: actor.ctx.organization.id };
  return { job, viewer };
}

function jobApplicationScope(jobId: string, viewer: PipelineViewer): SQL {
  return viewer.kind === "employer" ? and(eq(applications.jobId, jobId), isNotNull(applications.sharedWithEmployerAt))! : eq(applications.jobId, jobId);
}

export type JobApplicationFilters = { stageKey?: string; column?: PipelineColumnKey; status?: ApplicationStatus; flaggedOnly?: boolean; q?: string };

/** Applications of one job as a paged list (employers: shared applications of their own job). */
export async function listApplicationsForJob(actor: StaffActor | EmployerActor, jobId: string, filters: JobApplicationFilters, page: PageQuery): Promise<Paginated<PipelineCard>> {
  const { job, viewer } = await loadJobForPipeline(actor, jobId);
  const where: SQL[] = [jobApplicationScope(job.id, viewer)];
  if (filters.stageKey) where.push(eq(workflowStages.key, filters.stageKey));
  if (filters.status) where.push(eq(applications.status, filters.status));
  if (filters.flaggedOnly) where.push(sql`jsonb_array_length(${applications.knockoutFlags}) > 0`);
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, "").slice(0, 100)}%`;
    where.push(or(ilike(applications.code, q), viewer.kind === "staff" ? ilike(users.displayName, q) : and(isNotNull(applications.consentToShareAt), ilike(users.displayName, q)))!);
  }
  if (filters.column) {
    const stages = await db.select().from(workflowStages).where(inArray(workflowStages.workflowId, db.selectDistinct({ id: applications.workflowId }).from(applications).where(eq(applications.jobId, job.id))));
    const ids = stages.filter((s) => pipelineColumnForStage(s) === filters.column).map((s) => s.id);
    if (!ids.length) return paginated([], 0, page);
    where.push(inArray(applications.currentStageId, ids));
  }
  const condition = and(...where);
  const [rows, total] = await Promise.all([
    cardQuery().where(condition).orderBy(desc(applications.lastStageChangedAt)).limit(page.pageSize).offset(page.offset),
    db
      .select({ value: count() })
      .from(applications)
      .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(condition),
  ]);
  return paginated(rows.map((r) => toPipelineCard(r, viewer)), total[0]?.value ?? 0, page);
}

export type PipelineBoard = {
  job: { id: string; code: string; title: string; status: string; organizationId: string | null; requirementId: string | null };
  requirement: { id: string; code: string; title: string; status: string; column: RequirementPipelineColumnKey | null } | null;
  /** Stages of the workflow(s) used by the job's applications (drop targets: use dropTargetStage / allowedTargetStages from workflow.ts). */
  stages: StageView[];
  columns: { key: PipelineColumnKey; label: string; count: number; cards: PipelineCard[] }[];
  total: number;
};

/** Kanban board for a job, grouped by PIPELINE_COLUMNS (cards capped per column; counts are exact). */
export async function getPipelineBoard(actor: StaffActor | EmployerActor, jobId: string, opts: { perColumnLimit?: number } = {}): Promise<PipelineBoard> {
  const { job, viewer } = await loadJobForPipeline(actor, jobId);
  const perColumn = Math.min(Math.max(opts.perColumnLimit ?? 100, 1), 500);
  const scope = jobApplicationScope(job.id, viewer);
  const [rows, stageCounts, workflowIds] = await Promise.all([
    cardQuery().where(scope).orderBy(desc(applications.lastStageChangedAt)).limit(5000),
    db
      .select({ stageId: applications.currentStageId, key: workflowStages.key, category: workflowStages.category, value: count() })
      .from(applications)
      .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .where(scope)
      .groupBy(applications.currentStageId, workflowStages.key, workflowStages.category),
    db.selectDistinct({ id: applications.workflowId }).from(applications).where(eq(applications.jobId, job.id)),
  ]);
  const stages = workflowIds.length ? await db.select().from(workflowStages).where(inArray(workflowStages.workflowId, workflowIds.map((w) => w.id))).orderBy(asc(workflowStages.sortOrder)) : [];
  const counts = new Map<PipelineColumnKey, number>();
  for (const s of stageCounts) {
    const column = pipelineColumnForStage(s);
    counts.set(column, (counts.get(column) ?? 0) + Number(s.value));
  }
  const cardsByColumn = new Map<PipelineColumnKey, PipelineCard[]>();
  for (const r of rows) {
    const card = toPipelineCard(r, viewer);
    const list = cardsByColumn.get(card.column) ?? [];
    if (list.length < perColumn) list.push(card);
    cardsByColumn.set(card.column, list);
  }
  let requirement: PipelineBoard["requirement"] = null;
  if (job.requirementId) {
    const [req] = await db
      .select({ id: requirementRequests.id, code: requirementRequests.code, title: requirementRequests.title, status: requirementRequests.status, organizationId: requirementRequests.organizationId })
      .from(requirementRequests)
      .where(eq(requirementRequests.id, job.requirementId))
      .limit(1);
    if (req && (viewer.kind === "staff" || req.organizationId === viewer.organizationId)) {
      requirement = { id: req.id, code: req.code, title: req.title, status: req.status, column: requirementPipelineColumn(req.status) };
    }
  }
  return {
    job: { id: job.id, code: job.code, title: job.title, status: job.status, organizationId: job.organizationId, requirementId: job.requirementId },
    requirement,
    stages: stages.map(toStageView),
    columns: PIPELINE_COLUMNS.map((c) => ({ key: c.key, label: c.label, count: counts.get(c.key) ?? 0, cards: cardsByColumn.get(c.key) ?? [] })),
    total: [...counts.values()].reduce((a, b) => a + b, 0),
  };
}

export type EmployerPipelineOverview = {
  requirementColumns: {
    key: RequirementPipelineColumnKey;
    label: string;
    requirements: { id: string; code: string; title: string; status: string; totalPositions: number; createdAt: Date }[];
  }[];
  jobs: { id: string; code: string; title: string; status: string; requirementId: string | null; total: number; counts: Record<PipelineColumnKey, number> }[];
};

/** Employer pipeline overview: requirements by New / Approved / Sourcing, then each job's counts per candidate column. */
export async function getEmployerPipelineOverview(ctx: OrgContext<"employer">): Promise<EmployerPipelineOverview> {
  assertOrg(ctx, "employer.pipeline.view");
  const statuses = REQUIREMENT_PIPELINE_COLUMNS.flatMap((c) => [...c.statuses]);
  const [requirements, jobRows, stageCounts] = await Promise.all([
    db
      .select({ id: requirementRequests.id, code: requirementRequests.code, title: requirementRequests.title, status: requirementRequests.status, totalPositions: requirementRequests.totalPositions, createdAt: requirementRequests.createdAt })
      .from(requirementRequests)
      .where(and(eq(requirementRequests.organizationId, ctx.organization.id), inArray(requirementRequests.status, statuses)))
      .orderBy(desc(requirementRequests.createdAt))
      .limit(300),
    db
      .select({ id: jobs.id, code: jobs.code, title: jobs.title, status: jobs.status, requirementId: jobs.requirementId })
      .from(jobs)
      .where(and(eq(jobs.organizationId, ctx.organization.id), isNull(jobs.deletedAt), inArray(jobs.status, ["published", "paused", "closed"])))
      .orderBy(desc(jobs.updatedAt))
      .limit(300),
    db
      .select({ jobId: applications.jobId, key: workflowStages.key, category: workflowStages.category, value: count() })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .where(and(eq(jobs.organizationId, ctx.organization.id), isNotNull(applications.sharedWithEmployerAt)))
      .groupBy(applications.jobId, workflowStages.key, workflowStages.category),
  ]);
  const emptyCounts = (): Record<PipelineColumnKey, number> => Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.key, 0])) as Record<PipelineColumnKey, number>;
  const perJob = new Map<string, Record<PipelineColumnKey, number>>();
  for (const s of stageCounts) {
    const counts = perJob.get(s.jobId) ?? emptyCounts();
    counts[pipelineColumnForStage(s)] += Number(s.value);
    perJob.set(s.jobId, counts);
  }
  return {
    requirementColumns: REQUIREMENT_PIPELINE_COLUMNS.map((c) => ({
      key: c.key,
      label: c.label,
      requirements: requirements.filter((r) => requirementPipelineColumn(r.status) === c.key),
    })),
    jobs: jobRows.map((j) => {
      const counts = perJob.get(j.id) ?? emptyCounts();
      return { ...j, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Staff (Command Centre)
// ---------------------------------------------------------------------------

export type StaffApplicationFilters = {
  requirementId?: string;
  jobId?: string;
  stageKey?: string;
  status?: ApplicationStatus;
  partnerOrganizationId?: string;
  source?: ApplicationSource;
  assignedToUserId?: string;
  organizationId?: string;
  sharedWithEmployer?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  /** Application code or candidate name. */
  q?: string;
};

export type ApplicationListItem = {
  id: string;
  code: string;
  status: ApplicationStatus;
  source: ApplicationSource;
  createdAt: Date;
  lastStageChangedAt: Date;
  stage: { key: string; name: string; category: WorkflowStageCategory };
  job: { id: string; code: string; title: string; organizationId: string | null; organizationName: string | null; managedByVenkatSai: boolean; requirementId: string | null };
  candidate: { id: string; displayName: string };
  partnerOrganizationId: string | null;
  partnerName: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  knockoutFlagCount: number;
  sharedWithEmployerAt: Date | null;
};

const partnerOrg = alias(organizations, "partner_org");
const assignee = alias(users, "assignee");

export async function listApplicationsForStaff(ctx: StaffContext, filters: StaffApplicationFilters, page: PageQuery): Promise<Paginated<ApplicationListItem>> {
  assertStaff(ctx, ["recruitment.view", "recruitment.manage"], "any");
  const where: SQL[] = [];
  if (filters.requirementId && isUuid(filters.requirementId)) where.push(eq(jobs.requirementId, filters.requirementId));
  if (filters.jobId && isUuid(filters.jobId)) where.push(eq(applications.jobId, filters.jobId));
  if (filters.stageKey) where.push(eq(workflowStages.key, filters.stageKey));
  if (filters.status) where.push(eq(applications.status, filters.status));
  if (filters.partnerOrganizationId && isUuid(filters.partnerOrganizationId)) where.push(eq(applications.partnerOrganizationId, filters.partnerOrganizationId));
  if (filters.source) where.push(eq(applications.source, filters.source));
  if (filters.assignedToUserId && isUuid(filters.assignedToUserId)) where.push(eq(applications.assignedToUserId, filters.assignedToUserId));
  if (filters.organizationId && isUuid(filters.organizationId)) where.push(eq(jobs.organizationId, filters.organizationId));
  if (filters.sharedWithEmployer !== undefined) where.push(filters.sharedWithEmployer ? isNotNull(applications.sharedWithEmployerAt) : isNull(applications.sharedWithEmployerAt));
  if (filters.createdFrom) where.push(gte(applications.createdAt, filters.createdFrom));
  if (filters.createdTo) where.push(lte(applications.createdAt, filters.createdTo));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, "").slice(0, 100)}%`;
    where.push(or(ilike(applications.code, q), ilike(users.displayName, q))!);
  }
  const condition = where.length ? and(...where) : undefined;
  const base = () =>
    db
      .select({
        id: applications.id,
        code: applications.code,
        status: applications.status,
        source: applications.source,
        createdAt: applications.createdAt,
        lastStageChangedAt: applications.lastStageChangedAt,
        stage: { key: workflowStages.key, name: workflowStages.name, category: workflowStages.category },
        job: {
          id: jobs.id,
          code: jobs.code,
          title: jobs.title,
          organizationId: jobs.organizationId,
          organizationName: organizations.name,
          managedByVenkatSai: jobs.managedByVenkatSai,
          requirementId: jobs.requirementId,
        },
        candidate: { id: candidateProfiles.id, displayName: users.displayName },
        partnerOrganizationId: applications.partnerOrganizationId,
        partnerName: partnerOrg.name,
        assignedToUserId: applications.assignedToUserId,
        assignedToName: assignee.displayName,
        knockoutFlags: applications.knockoutFlags,
        sharedWithEmployerAt: applications.sharedWithEmployerAt,
      })
      .from(applications)
      .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
      .leftJoin(partnerOrg, eq(partnerOrg.id, applications.partnerOrganizationId))
      .leftJoin(assignee, eq(assignee.id, applications.assignedToUserId));
  const [rows, total] = await Promise.all([
    base().where(condition).orderBy(desc(applications.lastStageChangedAt)).limit(page.pageSize).offset(page.offset),
    db
      .select({ value: count() })
      .from(applications)
      .innerJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(condition),
  ]);
  return paginated(
    rows.map(({ knockoutFlags, ...r }) => ({ ...r, knockoutFlagCount: knockoutFlags.length })),
    total[0]?.value ?? 0,
    page,
  );
}

export type HistoryEntryView = {
  id: string;
  from: { key: string; name: string } | null;
  to: { key: string; name: string; candidateLabel: string };
  changedByType: string;
  changedByName: string | null;
  /** Internal note (staff: always; employer: only notes written by its own members). */
  note: string | null;
  candidateVisibleNote: string | null;
  createdAt: Date;
};

export type ApplicationAnswerView = { questionId: string | null; question: string; type: string; answer: ScreeningAnswerValue; isFlagged: boolean };

export type StaffApplicationDetail = {
  application: typeof applications.$inferSelect;
  job: { id: string; code: string; title: string; slug: string; organizationId: string | null; organizationName: string | null; managedByVenkatSai: boolean; requirementId: string | null; status: string; isOverseas: boolean };
  candidate: { id: string; userId: string; displayName: string };
  stage: StageView;
  stages: StageView[];
  /** Stages staff may move the application to now. */
  allowedTargets: StageView[];
  history: HistoryEntryView[];
  answers: ApplicationAnswerView[];
  notes: ApplicationNoteView[];
  interviews: InterviewView[];
  offers: OfferView[];
  placement: PlacementView | null;
  partnerSubmission: { id: string; code: string; partnerOrganizationId: string; partnerName: string | null; status: string } | null;
};

const fromStage = alias(workflowStages, "from_stage");

async function loadHistory(applicationId: string) {
  return db
    .select({
      id: applicationStageHistory.id,
      fromKey: fromStage.key,
      fromName: fromStage.name,
      toKey: workflowStages.key,
      toName: workflowStages.name,
      toCandidateLabel: workflowStages.candidateLabel,
      changedByType: applicationStageHistory.changedByType,
      changedByName: users.displayName,
      changedByOrganizationId: applicationStageHistory.changedByOrganizationId,
      note: applicationStageHistory.note,
      candidateVisibleNote: applicationStageHistory.candidateVisibleNote,
      createdAt: applicationStageHistory.createdAt,
    })
    .from(applicationStageHistory)
    .innerJoin(workflowStages, eq(workflowStages.id, applicationStageHistory.toStageId))
    .leftJoin(fromStage, eq(fromStage.id, applicationStageHistory.fromStageId))
    .leftJoin(users, eq(users.id, applicationStageHistory.changedByUserId))
    .where(eq(applicationStageHistory.applicationId, applicationId))
    .orderBy(asc(applicationStageHistory.createdAt));
}

async function loadAnswers(applicationId: string): Promise<ApplicationAnswerView[]> {
  const rows = await db
    .select({ questionId: applicationAnswers.questionId, snapshot: applicationAnswers.questionSnapshot, answer: applicationAnswers.answer, isFlagged: applicationAnswers.isFlagged })
    .from(applicationAnswers)
    .where(eq(applicationAnswers.applicationId, applicationId))
    .orderBy(asc(applicationAnswers.createdAt));
  return rows.map((r) => ({ questionId: r.questionId, question: r.snapshot.question, type: r.snapshot.type, answer: r.answer, isFlagged: r.isFlagged }));
}

export async function getApplicationForStaff(ctx: StaffContext, applicationId: string): Promise<StaffApplicationDetail> {
  assertStaff(ctx, ["recruitment.view", "recruitment.manage"], "any");
  const scope = await loadApplicationScope(applicationId);
  if (!scope) throw notFoundError("Application");
  const actor: StaffActor = { kind: "staff", ctx };
  const [stages, history, answers, notes, interviews, offers, placement, candidate, submission] = await Promise.all([
    loadWorkflowStages(scope.workflowId),
    loadHistory(scope.id),
    loadAnswers(scope.id),
    listApplicationNotes(actor, scope.id),
    listInterviewsForApplication(actor, scope.id),
    listOffersForApplication(actor, scope.id),
    getPlacementForApplication(actor, scope.id),
    db.select({ displayName: users.displayName }).from(users).where(eq(users.id, scope.candidateUserId)).limit(1),
    db
      .select({ id: partnerSubmissions.id, code: partnerSubmissions.code, partnerOrganizationId: partnerSubmissions.partnerOrganizationId, partnerName: organizations.name, status: partnerSubmissions.status })
      .from(partnerSubmissions)
      .leftJoin(organizations, eq(organizations.id, partnerSubmissions.partnerOrganizationId))
      .where(eq(partnerSubmissions.applicationId, scope.id))
      .limit(1),
  ]);
  const current = stages.find((s) => s.id === scope.currentStageId)!;
  const { job, organizationName, candidateUserId, ...application } = scope;
  const [jobExtra] = await db.select({ slug: jobs.slug }).from(jobs).where(eq(jobs.id, job.id)).limit(1);
  return {
    application,
    job: { id: job.id, code: job.code, title: job.title, slug: jobExtra?.slug ?? job.slug, organizationId: job.organizationId, organizationName, managedByVenkatSai: job.managedByVenkatSai, requirementId: job.requirementId, status: job.status, isOverseas: job.isOverseas },
    candidate: { id: scope.candidateId, userId: candidateUserId, displayName: candidate[0]?.displayName ?? "" },
    stage: toStageView(current),
    stages: stages.map(toStageView),
    allowedTargets: allowedTargetStages("staff", current, stages).map(toStageView),
    history: history.map((h) => ({
      id: h.id,
      from: h.fromKey ? { key: h.fromKey, name: h.fromName ?? h.fromKey } : null,
      to: { key: h.toKey, name: h.toName, candidateLabel: h.toCandidateLabel },
      changedByType: h.changedByType,
      changedByName: h.changedByName,
      note: h.note,
      candidateVisibleNote: h.candidateVisibleNote,
      createdAt: h.createdAt,
    })),
    answers,
    notes,
    interviews,
    offers,
    placement,
    partnerSubmission: submission[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Employer application detail
// ---------------------------------------------------------------------------

export type EmployerApplicationDetail = {
  application: {
    id: string;
    code: string;
    status: ApplicationStatus;
    source: "direct" | "venkat_sai";
    coverLetter: string | null;
    resumeFileId: string | null;
    expectedSalary: { amountMinor: number; currency: string; period: string } | null;
    knockoutFlags: ApplicationKnockoutFlag[];
    rating: number | null;
    isShortlisted: boolean;
    profileSnapshot: Record<string, unknown>;
    createdAt: Date;
    lastStageChangedAt: Date;
    sharedWithEmployerAt: Date | null;
    rejectionReasonCode: string | null;
  };
  job: { id: string; code: string; title: string };
  candidate: CandidateCard | null;
  stage: StageView;
  stages: StageView[];
  /** Stages the employer may move the application to now. */
  allowedTargets: StageView[];
  history: HistoryEntryView[];
  answers: ApplicationAnswerView[];
  notes: ApplicationNoteView[];
  interviews: InterviewView[];
  offers: OfferView[];
  placement: PlacementView | null;
};

export async function getApplicationForEmployer(ctx: OrgContext<"employer">, applicationId: string): Promise<EmployerApplicationDetail> {
  assertOrg(ctx, "employer.pipeline.view");
  const scope = await loadApplicationScope(applicationId);
  if (!scope || scope.job.organizationId !== ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Application");
  const actor: EmployerActor = { kind: "employer", ctx };
  const canSeeOffers = ctx.permissions.has("employer.offers.manage") || ctx.permissions.has("employer.pipeline.view");
  const [stages, history, answers, notes, interviews, offers, placement, cards] = await Promise.all([
    loadWorkflowStages(scope.workflowId),
    loadHistory(scope.id),
    loadAnswers(scope.id),
    listApplicationNotes(actor, scope.id),
    listInterviewsForApplication(actor, scope.id),
    canSeeOffers ? listOffersForApplication(actor, scope.id) : Promise.resolve([]),
    getPlacementForApplication(actor, scope.id),
    loadCandidateCards({ kind: "organization", organizationId: ctx.organization.id }, [scope.candidateId]),
  ]);
  const current = stages.find((s) => s.id === scope.currentStageId)!;
  return {
    application: {
      id: scope.id,
      code: scope.code,
      status: scope.status,
      source: scope.source === "direct" ? "direct" : "venkat_sai",
      coverLetter: scope.coverLetter,
      resumeFileId: scope.resumeFileId,
      expectedSalary:
        scope.expectedSalaryMinor !== null && scope.expectedSalaryCurrency && scope.expectedSalaryPeriod
          ? { amountMinor: scope.expectedSalaryMinor, currency: scope.expectedSalaryCurrency, period: scope.expectedSalaryPeriod }
          : null,
      knockoutFlags: scope.knockoutFlags,
      rating: scope.rating,
      isShortlisted: scope.isShortlisted,
      profileSnapshot: scope.profileSnapshot,
      createdAt: scope.createdAt,
      lastStageChangedAt: scope.lastStageChangedAt,
      sharedWithEmployerAt: scope.sharedWithEmployerAt,
      rejectionReasonCode: scope.rejectionReasonCode,
    },
    job: { id: scope.job.id, code: scope.job.code, title: scope.job.title },
    candidate: cards[0] ?? null,
    stage: toStageView(current),
    stages: stages.map(toStageView),
    allowedTargets: ctx.permissions.has("employer.pipeline.manage") ? allowedTargetStages("employer", current, stages).map(toStageView) : [],
    history: history.map((h) => ({
      id: h.id,
      from: h.fromKey ? { key: h.fromKey, name: h.fromName ?? h.fromKey } : null,
      to: { key: h.toKey, name: h.toName, candidateLabel: h.toCandidateLabel },
      changedByType: h.changedByType === "employer" ? "employer" : h.changedByType === "candidate" ? "candidate" : "venkat_sai",
      changedByName: h.changedByType === "employer" && h.changedByOrganizationId === ctx.organization.id ? h.changedByName : null,
      note: h.changedByType === "employer" && h.changedByOrganizationId === ctx.organization.id ? h.note : null,
      candidateVisibleNote: h.candidateVisibleNote,
      createdAt: h.createdAt,
    })),
    answers,
    notes,
    interviews,
    offers,
    placement,
  };
}

/** Current stage + stages the actor may move to (for menus); applies the same scope rules as transitionApplication. */
export async function getApplicationStageOptions(actor: StaffActor | EmployerActor, applicationId: string): Promise<{ current: StageView; allowed: StageView[] }> {
  const scope = await loadApplicationScope(applicationId);
  if (!scope) throw notFoundError("Application");
  if (actor.kind === "staff") assertStaff(actor.ctx, ["recruitment.view", "recruitment.manage"], "any");
  else {
    assertOrg(actor.ctx, "employer.pipeline.view");
    if (scope.job.organizationId !== actor.ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Application");
  }
  const stages = await loadWorkflowStages(scope.workflowId);
  const current = stages.find((s) => s.id === scope.currentStageId)!;
  const canManage = actor.kind === "staff" ? actor.ctx.permissions.has("recruitment.manage") : actor.ctx.permissions.has("employer.pipeline.manage");
  return { current: toStageView(current), allowed: canManage ? allowedTargetStages(actor.kind, current, stages).map(toStageView) : [] };
}

