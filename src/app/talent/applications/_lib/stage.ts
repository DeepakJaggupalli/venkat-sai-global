import type { CandidateApplicationListItem } from "@/modules/recruitment/types";

type CandidateStageView = CandidateApplicationListItem["stage"];

/**
 * Candidate-facing stage wording in the viewer's language: the workflow's own translation when an
 * administrator provided one, else the candidate label (never the internal pipeline name).
 */
export function stageLabel(stage: Pick<CandidateStageView, "label" | "translations">, locale: string): string {
  return stage.translations?.[locale]?.label?.trim() || stage.label;
}

export function stageDescription(stage: Pick<CandidateStageView, "description" | "translations">, locale: string): string | null {
  return stage.translations?.[locale]?.description?.trim() || stage.description;
}

/** Badge tone of a stage category (text always accompanies the colour). */
export function stageTone(stage: Pick<CandidateStageView, "category">): "info" | "success" | "warning" | "danger" | "neutral" | "brand" {
  switch (stage.category) {
    case "offer":
    case "pre_joining":
    case "joined":
      return "success";
    case "interview":
    case "assessment":
    case "decision":
      return "brand";
    case "rejected":
    case "withdrawn":
    case "closed":
      return "neutral";
    default:
      return "info";
  }
}
