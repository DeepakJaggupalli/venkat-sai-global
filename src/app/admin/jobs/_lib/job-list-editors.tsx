import type { LocationDraft, SkillDraft } from "@/components/employer/job-form/list-editors";
import { LocationsEditor, SkillsEditor } from "@/components/employer/job-form/list-editors";
import type { ScreeningDraft } from "@/components/employer/job-form/screening";
import { ScreeningBuilder } from "@/components/employer/job-form/screening-builder";
import type { SelectOption } from "@/components/shared/types";

/**
 * Skills, additional locations and screening questions of the Command Centre job form. The editors post
 * `skills:json`, `locations:json`, `screeningQuestions:json` and `screeningRequired`, so a re-post of the
 * form keeps every child list exactly as loaded (the jobs module replaces them from the posted payload).
 */
export function StaffJobListEditors({
  skills,
  locations,
  screeningQuestions,
  screeningRequired,
  countries,
}: {
  skills: SkillDraft[];
  locations: LocationDraft[];
  screeningQuestions: ScreeningDraft[];
  screeningRequired: boolean;
  countries: SelectOption[];
}) {
  return (
    <div className="space-y-6 border-t border-border pt-6">
      <section className="space-y-2" aria-labelledby="staff-job-skills">
        <p id="staff-job-skills" className="text-sm font-medium text-foreground">
          Skills
        </p>
        <SkillsEditor defaultSkills={skills} errors={[]} labelledBy="staff-job-skills" />
      </section>
      <section className="space-y-2">
        <p className="text-sm font-medium text-foreground">Additional locations</p>
        <LocationsEditor defaultLocations={locations} countries={countries} errors={[]} />
      </section>
      <section className="space-y-2">
        <p className="text-sm font-medium text-foreground">Screening questions</p>
        <p className="text-xs text-muted-foreground">Only used for applications made on Venkat Sai Global.</p>
        <ScreeningBuilder defaultQuestions={screeningQuestions} defaultRequired={screeningRequired} errors={[]} />
      </section>
    </div>
  );
}
