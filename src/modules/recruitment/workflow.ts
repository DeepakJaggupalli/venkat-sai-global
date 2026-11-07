/**
 * Pipeline rules (pure and client-safe, no server imports).
 *
 *  - Stage helpers: initial stage, lookups by key / category, derived application status.
 *  - Who may move an application where: `canTransition(actorType, from, to)`.
 *  - The employer pipeline board (spec 9.5): `PIPELINE_COLUMNS` and `pipelineColumnForStage()`;
 *    the requirement-level columns (New / Approved / Sourcing) come from requirement_requests.status
 *    through `REQUIREMENT_PIPELINE_COLUMNS`.
 *
 * Stages are data (application_workflows → workflow_stages). Rules key off the stage CATEGORY (a
 * fixed vocabulary) and only fall back to well-known stage keys of the default workflow where a
 * category is not specific enough.
 */
import type { RequirementStatus } from "@/db/schema/operations";
import type { ApplicationActorType, ApplicationStatus, WorkflowStageCategory } from "@/db/schema/recruitment";

/** Minimal stage shape the rules need (a workflow_stages row satisfies it). */
export type StageLike = {
  id?: string;
  key: string;
  name?: string;
  category: WorkflowStageCategory;
  isTerminal: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

/** Keys of the default "Standard recruitment" workflow (spec 8.5), used for automatic moves. */
export const STAGE_KEYS = {
  submitted: "submitted",
  underReview: "under_review",
  shortlisted: "shortlisted",
  assessmentPending: "assessment_pending",
  assessmentCompleted: "assessment_completed",
  interviewScheduled: "interview_scheduled",
  interviewCompleted: "interview_completed",
  employerDecisionPending: "employer_decision_pending",
  selected: "selected",
  offerIssued: "offer_issued",
  offerAccepted: "offer_accepted",
  documentation: "documentation",
  mobilisation: "mobilisation",
  joined: "joined",
  closed: "closed",
  rejected: "rejected",
  withdrawn: "withdrawn",
} as const;
export type DefaultStageKey = (typeof STAGE_KEYS)[keyof typeof STAGE_KEYS];

/** Pipeline order of the categories (terminal "exit" categories share the last rank). */
export const CATEGORY_RANK: Readonly<Record<WorkflowStageCategory, number>> = {
  applied: 0,
  screening: 1,
  assessment: 2,
  interview: 3,
  decision: 4,
  offer: 5,
  pre_joining: 6,
  joined: 7,
  closed: 8,
  rejected: 8,
  withdrawn: 8,
};

export const TERMINAL_CATEGORIES = ["joined", "closed", "rejected", "withdrawn"] as const satisfies readonly WorkflowStageCategory[];

export function isTerminalCategory(category: WorkflowStageCategory): boolean {
  return (TERMINAL_CATEGORIES as readonly WorkflowStageCategory[]).includes(category);
}

/** A stage is final when flagged terminal or when its category is an exit category. */
export function isFinalStage(stage: Pick<StageLike, "category" | "isTerminal">): boolean {
  return stage.isTerminal || isTerminalCategory(stage.category);
}

/** applications.status derived from the current stage's category. */
export function statusForCategory(category: WorkflowStageCategory): ApplicationStatus {
  switch (category) {
    case "joined":
      return "hired";
    case "rejected":
      return "rejected";
    case "withdrawn":
      return "withdrawn";
    case "closed":
      return "closed";
    default:
      return "active";
  }
}

function byOrder(a: StageLike, b: StageLike): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/** Active stages in pipeline order. */
export function orderedStages<T extends StageLike>(stages: readonly T[]): T[] {
  return stages.filter((s) => s.isActive !== false).sort(byOrder);
}

export function findStageByKey<T extends StageLike>(stages: readonly T[], key: string): T | undefined {
  return stages.find((s) => s.key === key && s.isActive !== false);
}

/** First active stage of a category (pipeline order). */
export function firstStageInCategory<T extends StageLike>(stages: readonly T[], category: WorkflowStageCategory): T | undefined {
  return orderedStages(stages).find((s) => s.category === category);
}

/** Where a new application starts: the first "applied" stage, else the first non-final stage. */
export function initialStage<T extends StageLike>(stages: readonly T[]): T | undefined {
  return firstStageInCategory(stages, "applied") ?? orderedStages(stages).find((s) => !isFinalStage(s));
}

/**
 * Resolve a target stage for an automatic move: the stage with `preferredKey` when the workflow has
 * it, otherwise the first stage of `fallbackCategory`.
 */
export function resolveStage<T extends StageLike>(stages: readonly T[], preferredKey: string, fallbackCategory?: WorkflowStageCategory): T | undefined {
  return findStageByKey(stages, preferredKey) ?? (fallbackCategory ? firstStageInCategory(stages, fallbackCategory) : undefined);
}

/** True when `to` is further down the pipeline than `from` (used to decide automatic forward moves). */
export function isForwardMove(from: StageLike, to: StageLike): boolean {
  if (isFinalStage(from)) return false;
  const rankFrom = CATEGORY_RANK[from.category];
  const rankTo = CATEGORY_RANK[to.category];
  if (rankTo !== rankFrom) return rankTo > rankFrom;
  return (to.sortOrder ?? 0) > (from.sortOrder ?? 0);
}

// ---------------------------------------------------------------------------
// Transition permissions
// ---------------------------------------------------------------------------

/** Stages entered only through a domain event (the candidate accepting an offer), never dragged by an employer. */
export const SYSTEM_MANAGED_STAGE_KEYS: readonly string[] = [STAGE_KEYS.offerAccepted];

/** Employers act on review, shortlist, interview, decision and offer stages of their own jobs. */
export const EMPLOYER_TARGET_CATEGORIES = ["screening", "interview", "decision", "offer", "rejected"] as const satisfies readonly WorkflowStageCategory[];

/** Employers may move applications only while they are in these categories (not once pre-joining starts). */
export const EMPLOYER_SOURCE_CATEGORIES = [
  "applied",
  "screening",
  "assessment",
  "interview",
  "decision",
  "offer",
] as const satisfies readonly WorkflowStageCategory[];

export type TransitionDenial =
  | "same_stage"
  | "stage_inactive"
  | "actor_not_allowed"
  | "from_final"
  | "withdrawn_is_final"
  | "target_not_allowed";

export type TransitionCheck = { allowed: true } | { allowed: false; reason: TransitionDenial; message: string };

const deny = (reason: TransitionDenial, message: string): TransitionCheck => ({ allowed: false, reason, message });

/**
 * May `actorType` move an application from `from` to `to`? (Ownership and permission keys are
 * checked by the service; this is the stage-level matrix.)
 *
 *  - staff: any active stage, including re-opening rejected / closed / joined applications — except
 *    out of "withdrawn" (the candidate re-applies instead, which records fresh consent).
 *  - employer: from applied … offer (not once pre-joining has started) to screening, interview,
 *    decision, offer or rejected stages; never into system-managed stages (offer accepted).
 *  - partner: none (partners submit candidates; Venkat Sai and employers move them).
 *  - candidate: withdraw only, from any non-final stage.
 *  - system: anything except staying put (domain events: offer accepted, joining confirmed, …).
 */
export function canTransition(actorType: ApplicationActorType, from: StageLike, to: StageLike): TransitionCheck {
  if ((from.id && to.id && from.id === to.id) || from.key === to.key) {
    return deny("same_stage", "The application is already in this stage.");
  }
  if (to.isActive === false) return deny("stage_inactive", "This stage is no longer in use.");

  switch (actorType) {
    case "system":
      return { allowed: true };
    case "staff":
      if (from.category === "withdrawn") {
        return deny("withdrawn_is_final", "The candidate withdrew this application. They can apply again if they wish.");
      }
      return { allowed: true };
    case "employer": {
      if (isFinalStage(from)) return deny("from_final", "This application is closed.");
      if (!(EMPLOYER_SOURCE_CATEGORIES as readonly string[]).includes(from.category)) {
        return deny("actor_not_allowed", "Venkat Sai is handling this application at its current stage.");
      }
      if (!(EMPLOYER_TARGET_CATEGORIES as readonly string[]).includes(to.category) || SYSTEM_MANAGED_STAGE_KEYS.includes(to.key)) {
        return deny("target_not_allowed", "You cannot move applications to this stage.");
      }
      return { allowed: true };
    }
    case "candidate":
      if (to.category !== "withdrawn") return deny("target_not_allowed", "You can only withdraw an application.");
      if (isFinalStage(from)) return deny("from_final", "This application can no longer be withdrawn.");
      return { allowed: true };
    case "partner":
      return deny("actor_not_allowed", "Recruitment partners cannot move applications.");
  }
}

/** Stages `actorType` may move an application to from `from` (for menus and drop targets). */
export function allowedTargetStages<T extends StageLike>(actorType: ApplicationActorType, from: StageLike, stages: readonly T[]): T[] {
  return orderedStages(stages).filter((to) => canTransition(actorType, from, to).allowed);
}

// ---------------------------------------------------------------------------
// Employer pipeline board (spec 9.5)
// ---------------------------------------------------------------------------

export type PipelineColumnDef = {
  key: string;
  label: string;
  /** Default-workflow stages shown in this column. */
  stageKeys: readonly string[];
  /** Stage an application moves to when dropped into the column. */
  defaultStageKey: string;
};

export const PIPELINE_COLUMNS = [
  { key: "screening", label: "Screening", stageKeys: [STAGE_KEYS.submitted, STAGE_KEYS.underReview], defaultStageKey: STAGE_KEYS.underReview },
  { key: "shortlisted", label: "Shortlisted", stageKeys: [STAGE_KEYS.shortlisted], defaultStageKey: STAGE_KEYS.shortlisted },
  {
    key: "trade_test",
    label: "Trade test",
    stageKeys: [STAGE_KEYS.assessmentPending, STAGE_KEYS.assessmentCompleted],
    defaultStageKey: STAGE_KEYS.assessmentPending,
  },
  {
    key: "client_interview",
    label: "Client interview",
    stageKeys: [STAGE_KEYS.interviewScheduled, STAGE_KEYS.interviewCompleted, STAGE_KEYS.employerDecisionPending],
    defaultStageKey: STAGE_KEYS.interviewScheduled,
  },
  { key: "selected", label: "Selected", stageKeys: [STAGE_KEYS.selected], defaultStageKey: STAGE_KEYS.selected },
  { key: "offer", label: "Offer", stageKeys: [STAGE_KEYS.offerIssued, STAGE_KEYS.offerAccepted], defaultStageKey: STAGE_KEYS.offerIssued },
  { key: "documentation", label: "Documentation", stageKeys: [STAGE_KEYS.documentation], defaultStageKey: STAGE_KEYS.documentation },
  { key: "mobilisation", label: "Mobilisation", stageKeys: [STAGE_KEYS.mobilisation], defaultStageKey: STAGE_KEYS.mobilisation },
  { key: "joined", label: "Joined", stageKeys: [STAGE_KEYS.joined], defaultStageKey: STAGE_KEYS.joined },
  { key: "closed", label: "Closed", stageKeys: [STAGE_KEYS.closed, STAGE_KEYS.rejected, STAGE_KEYS.withdrawn], defaultStageKey: STAGE_KEYS.rejected },
] as const satisfies readonly PipelineColumnDef[];

export type PipelineColumnKey = (typeof PIPELINE_COLUMNS)[number]["key"];

export const PIPELINE_COLUMN_KEYS: readonly PipelineColumnKey[] = PIPELINE_COLUMNS.map((c) => c.key);

/** Column for custom stages whose key is not one of the default workflow's keys. */
const CATEGORY_COLUMN: Readonly<Record<WorkflowStageCategory, PipelineColumnKey>> = {
  applied: "screening",
  screening: "screening",
  assessment: "trade_test",
  interview: "client_interview",
  decision: "client_interview",
  offer: "offer",
  pre_joining: "documentation",
  joined: "joined",
  closed: "closed",
  rejected: "closed",
  withdrawn: "closed",
};

const COLUMN_BY_STAGE_KEY: ReadonlyMap<string, PipelineColumnKey> = new Map(
  PIPELINE_COLUMNS.flatMap((column) => column.stageKeys.map((key) => [key, column.key] as const)),
);

/** Board column for a stage: by default-workflow key, else by category. */
export function pipelineColumnForStage(stage: Pick<StageLike, "key" | "category">): PipelineColumnKey {
  // Exit categories always land in "closed", whatever the key.
  if (stage.category === "closed" || stage.category === "rejected" || stage.category === "withdrawn") return "closed";
  return COLUMN_BY_STAGE_KEY.get(stage.key) ?? CATEGORY_COLUMN[stage.category];
}

export function getPipelineColumn(key: string): (typeof PIPELINE_COLUMNS)[number] | undefined {
  return PIPELINE_COLUMNS.find((c) => c.key === key);
}

/**
 * The stage an application should move to when dropped into `columnKey` of a workflow: the column's
 * default stage when the workflow has it, otherwise the first active stage that maps to the column.
 */
export function dropTargetStage<T extends StageLike>(stages: readonly T[], columnKey: PipelineColumnKey): T | undefined {
  const column = getPipelineColumn(columnKey);
  if (!column) return undefined;
  return findStageByKey(stages, column.defaultStageKey) ?? orderedStages(stages).find((s) => pipelineColumnForStage(s) === columnKey);
}

/** Requirement-level columns that precede the candidate columns on the employer pipeline (spec 9.5). */
export const REQUIREMENT_PIPELINE_COLUMNS = [
  { key: "new", label: "New", statuses: ["submitted", "under_review"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "sourcing", label: "Sourcing", statuses: ["sourcing", "in_progress", "partially_filled"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly RequirementStatus[] }[];

export type RequirementPipelineColumnKey = (typeof REQUIREMENT_PIPELINE_COLUMNS)[number]["key"];

/** Requirement column for a requirement status, or null when the requirement is not on the board (draft, filled, closed…). */
export function requirementPipelineColumn(status: RequirementStatus): RequirementPipelineColumnKey | null {
  const column = REQUIREMENT_PIPELINE_COLUMNS.find((c) => (c.statuses as readonly RequirementStatus[]).includes(status));
  return column?.key ?? null;
}
