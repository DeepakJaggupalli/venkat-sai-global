import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RecommendationReason } from "@/modules/jobs/recommendation-scoring";

import { enumLabel, type Translate } from "./labels";

/** Translated text of one "why this job" reason (falls back to the module's English text). */
export function reasonText(t: Translate, reason: RecommendationReason): string {
  const params: Record<string, string | number> = { ...reason.params };
  if (reason.code === "employment_type" && typeof params.type === "string") params.type = enumLabel(t, "employmentType", params.type);
  if (reason.code === "work_mode" && typeof params.mode === "string") params.mode = enumLabel(t, "workMode", params.mode);
  const key = `recommendations.${reason.code}`;
  const text = t(key, params);
  return text === key ? reason.text : text;
}

/** "Why this job" list for recommended jobs: the strongest reasons first, every point explained. */
export function RecommendationReasons({ reasons, t, compact = false, className }: { reasons: RecommendationReason[]; t: Translate; compact?: boolean; className?: string }) {
  const shown = [...reasons].sort((a, b) => b.points - a.points).slice(0, compact ? 3 : reasons.length);
  if (!shown.length) return null;
  return (
    <div className={cn("rounded-lg bg-teal-soft/60 px-3 py-2", className)}>
      <p className="text-xs font-semibold text-teal-strong">{t("recommendations.why")}</p>
      <ul className="mt-1 space-y-0.5">
        {shown.map((reason) => (
          <li key={reason.code} className="flex items-start gap-1.5 text-xs text-foreground">
            <Check aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-teal-strong" />
            <span>{reasonText(t, reason)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
