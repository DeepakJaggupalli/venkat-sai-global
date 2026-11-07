import { BadgeCheck, Briefcase, GraduationCap, Star } from "lucide-react";

import { FileLink } from "@/components/files";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { DeleteItemButton, EditDialog } from "@/components/talent/profile/dialog";
import { EducationForm, ExperienceForm } from "@/components/talent/profile/history-forms";
import { LanguagesForm, SkillsForm } from "@/components/talent/profile/skills-forms";

import { deleteEducation, deleteExperience, saveEducation, saveExperience, saveLanguages, saveSkills } from "../actions";
import type { SectionProps } from "../_lib/options";
import { ItemStatus, periodText } from "./bits";

/** Work experience, education, skills (with Venkat Sai assessment results) and languages. */
export function HistorySections({ t, loc, detail, options }: SectionProps) {
  const countryName = (code: string | null) => (code ? (options.countries.find((c) => c.value === code)?.label ?? code) : null);
  const assessmentSkillIds = new Set(detail.skills.filter((s) => s.verified && s.source === "assessment").map((s) => s.skillId));

  return (
    <>
      <SectionCard
        id="experience"
        title={t("section.experience")}
        description={t("section.experience.description")}
        headingLevel="h2"
        action={
          <EditDialog mode="add" triggerLabel={t("action.add")} srLabel={`${t("action.add")}: ${t("section.experience")}`} title={t("experience.add")}>
            <ExperienceForm action={saveExperience} item={null} industries={options.industries} categories={options.categories} countries={options.countries} />
          </EditDialog>
        }
      >
        {detail.experience.length ? (
          <ol className="divide-y">
            {detail.experience.map((item) => (
              <li key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{item.jobTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {[item.employerName, item.employmentType ? t(`enum.employmentType.${item.employmentType}`) : null, [item.city, countryName(item.countryCode)].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-sm text-muted-foreground">{periodText(item.startDate, item.endDate, item.isCurrent, t, loc)}</p>
                  <ItemStatus status={item.verificationStatus} t={t} />
                  {item.evidence ? <FileLink file={item.evidence} /> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${item.jobTitle}`} title={t("experience.edit")}>
                    <ExperienceForm action={saveExperience} item={item} industries={options.industries} categories={options.categories} countries={options.countries} />
                  </EditDialog>
                  <DeleteItemButton action={deleteExperience} id={item.id} itemLabel={item.jobTitle} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState size="sm" icon={<Briefcase aria-hidden="true" />} title={t("experience.empty")} description={t("experience.emptyDescription")} />
        )}
      </SectionCard>

      <SectionCard
        id="education"
        title={t("section.education")}
        description={t("section.education.description")}
        headingLevel="h2"
        action={
          <EditDialog mode="add" triggerLabel={t("action.add")} srLabel={`${t("action.add")}: ${t("section.education")}`} title={t("education.add")}>
            <EducationForm action={saveEducation} item={null} levels={options.levels} qualificationTypes={options.qualificationTypes} countries={options.countries} />
          </EditDialog>
        }
      >
        {detail.education.length ? (
          <ol className="divide-y">
            {detail.education.map((item) => {
              const title = item.qualification || item.qualificationType?.name || item.educationLevel?.name || item.institutionName;
              return (
                <li key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{[item.institutionName !== title ? item.institutionName : null, item.specialisation, item.boardOrUniversity, countryName(item.countryCode)].filter(Boolean).join(" · ")}</p>
                    <p className="text-sm text-muted-foreground">
                      {[periodText(item.startDate, item.endDate, item.isCurrent, t, loc), item.gradeOrScore ? t("education.grade", { grade: item.gradeOrScore }) : null].filter(Boolean).join(" · ")}
                    </p>
                    <ItemStatus status={item.verificationStatus} t={t} />
                    {item.document ? <FileLink file={item.document} /> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${title}`} title={t("education.edit")}>
                      <EducationForm action={saveEducation} item={item} levels={options.levels} qualificationTypes={options.qualificationTypes} countries={options.countries} />
                    </EditDialog>
                    <DeleteItemButton action={deleteEducation} id={item.id} itemLabel={title} />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState size="sm" icon={<GraduationCap aria-hidden="true" />} title={t("education.empty")} description={t("education.emptyDescription")} />
        )}
      </SectionCard>

      <SectionCard
        id="skills"
        title={t("section.skills")}
        description={t("section.skills.description")}
        headingLevel="h2"
        action={
          <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${t("section.skills")}`} title={t("section.skills")}>
            <SkillsForm action={saveSkills} skills={detail.skills} />
          </EditDialog>
        }
      >
        {detail.skills.length ? (
          <ul className="flex flex-wrap gap-2" aria-label={t("section.skills")}>
            {detail.skills.map((skill) => (
              <li key={skill.skillId} className="inline-flex flex-wrap items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm">
                {skill.isPrimary ? <Star aria-label={t("skills.primary")} className="size-3.5 text-gold-strong" /> : null}
                <span className="font-medium">{skill.name}</span>
                {skill.level ? <span className="text-muted-foreground">· {t(`enum.skillLevel.${skill.level}`)}</span> : null}
                {skill.yearsExperience !== null ? <span className="text-muted-foreground">· {t("skills.years", { count: skill.yearsExperience })}</span> : null}
                {skill.verified ? (
                  <span className="inline-flex items-center gap-1 text-success-strong">
                    <BadgeCheck aria-hidden="true" className="size-3.5" />
                    {assessmentSkillIds.has(skill.skillId) ? t("skills.verifiedAssessment") : t("skills.verifiedCredential")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">· {t("verification.self_declared")}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("skills.empty")}</p>
        )}
        {detail.assessments.length ? (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-sm font-semibold">{t("assessments.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("assessments.description")}</p>
            <ul className="mt-3 space-y-2">
              {detail.assessments.map((a) => (
                <li key={a.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {t("assessments.label")}: {a.trade}
                    {a.skill ? ` · ${a.skill.name}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {[t(`assessments.result.${a.result}`), a.score !== null && a.maxScore !== null ? `${a.score}/${a.maxScore}` : null, a.standardReference ? t("assessments.reference", { ref: a.standardReference }) : null, a.code].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t("assessments.notAccredited")}</p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        id="languages"
        title={t("section.languages")}
        description={t("section.languages.description")}
        headingLevel="h2"
        action={
          <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${t("section.languages")}`} title={t("section.languages")}>
            <LanguagesForm action={saveLanguages} languages={detail.languages} options={options.languages} />
          </EditDialog>
        }
      >
        {detail.languages.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {detail.languages.map((l) => (
              <li key={l.code} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{l.name}</p>
                <p className="text-muted-foreground">
                  {[t(`enum.proficiency.${l.proficiency}`), l.canRead ? t("languages.canRead") : null, l.canWrite ? t("languages.canWrite") : null, l.canSpeak ? t("languages.canSpeak") : null].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("languages.empty")}</p>
        )}
      </SectionCard>
    </>
  );
}
