/**
 * "How employers see you" (client-safe, pure): runs the candidates module's own access policy
 * (policy.ts resolveCandidateAccess) for a typical verified employer, so the preview always matches
 * what organisations really get. Two scenarios: an employer searching the talent pool, and an
 * employer the candidate applied to (application shared).
 */
import { maskedName, resolveCandidateAccess, type CandidateAccess, type PrivacyFlags } from "@/modules/candidates/policy";
import type { CandidateVisibility } from "@/db/schema/candidates";

export const PREVIEW_SCENARIOS = ["search", "applied"] as const;
export type PreviewScenario = (typeof PREVIEW_SCENARIOS)[number];

export function parsePreviewScenario(value: string | null | undefined): PreviewScenario {
  return value === "applied" ? "applied" : "search";
}

const PREVIEW_PERMISSIONS: ReadonlySet<string> = new Set(["employer.candidates.search", "employer.pipeline.view"]);

export function previewAccess(
  state: { visibility: CandidateVisibility; isOpenToWork: boolean; privacy: PrivacyFlags; restrictedMinor: boolean },
  scenario: PreviewScenario,
): CandidateAccess {
  return resolveCandidateAccess(
    { visibility: state.visibility, isOpenToWork: state.isOpenToWork, deleted: false, accountActive: true, privacy: state.privacy, restrictedMinor: state.restrictedMinor },
    {
      kind: "employer",
      organizationId: "00000000-0000-0000-0000-000000000000",
      organizationStatus: "verified",
      permissions: PREVIEW_PERMISSIONS,
      hasApplicationShare: scenario === "applied",
      activeUnlock: null,
    },
  );
}

/** Name an employer sees: the full name, or initials until the candidate shares it. */
export function previewName(displayName: string, access: CandidateAccess): string {
  return access.fullName ? displayName : maskedName(displayName);
}
