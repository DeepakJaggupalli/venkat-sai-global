import { Award, Info } from "lucide-react";

import type { CourseCertificationType } from "@/db/schema/training";

import type { Translate } from "./course-text";

/**
 * Plain-language explanation of what a learner can earn. Venkat Sai assessment certificates are always
 * described as Venkat Sai results, never as external accredited qualifications (CONVENTIONS 15.4).
 */
export function CertificationNote({
  t,
  type,
  accreditationBody,
  providerName,
  headingLevel = "h3",
}: {
  t: Translate;
  type: CourseCertificationType;
  accreditationBody: string | null;
  providerName: string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const body =
    type === "accredited_external"
      ? accreditationBody
        ? t("certificationNote.accredited", { body: accreditationBody })
        : t("certificationNote.accreditedNoBody")
      : type === "venkat_sai_assessment"
        ? t("certificationNote.venkatSai")
        : type === "completion_only"
          ? t("certificationNote.completion", { provider: providerName })
          : t("certificationNote.none");
  return (
    <div className="rounded-lg border border-border bg-surface-subtle p-4" data-testid="certification-note">
      <Heading className="flex items-center gap-2 font-heading text-sm font-semibold text-navy">
        <Award aria-hidden="true" className="size-4 shrink-0 text-teal-strong" />
        {t(`certification.${type}`)}
      </Heading>
      <p className="mt-2 text-sm text-foreground/80">{body}</p>
      {type === "venkat_sai_assessment" || type === "completion_only" ? (
        <p className="mt-2 flex gap-2 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {t("certificationNote.notAccredited")}
        </p>
      ) : null}
    </div>
  );
}
