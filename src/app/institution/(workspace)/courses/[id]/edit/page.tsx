import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CourseForm } from "@/components/institution/course-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { fromMinorUnits } from "@/lib/format";
import { getFiles, toFileSummary } from "@/modules/files";
import { requireOrgMember } from "@/modules/identity/authz";
import { getInstitutionProfile, isAuthorisedIssuerNow } from "@/modules/organizations/institution";
import { getSkillsByIds, currencyOptions, listLanguages } from "@/modules/taxonomy/queries";
import { getCourseForActor } from "@/modules/training/queries";

import { orNotFound } from "../../../_lib/load";
import { uuidParam } from "../../../_lib/params";

export const metadata: Metadata = { title: "Edit course" };

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("institution", "institution.courses.manage");
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const { course } = await orNotFound(getCourseForActor(ctx, id));
  if (course.status === "archived") redirect(`/institution/courses/${course.id}`);
  const [currencies, languages, skills, cover, profile] = await Promise.all([
    currencyOptions(),
    listLanguages(),
    course.skillIds.length ? getSkillsByIds(course.skillIds) : Promise.resolve([]),
    course.coverFileId ? getFiles([course.coverFileId]) : Promise.resolve([]),
    getInstitutionProfile(ctx, ctx.organization.id),
  ]);
  const languageOptions = languages.map((l) => ({ value: l.code, label: l.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={course.code}
        title={`Edit ${course.title}`}
        breadcrumbs={[
          { label: "Institution", href: "/institution" },
          { label: "Courses", href: "/institution/courses" },
          { label: course.title, href: `/institution/courses/${course.id}` },
          { label: "Edit" },
        ]}
      />
      <SectionCard title="Course details">
        <CourseForm
          courseId={course.id}
          organizationId={ctx.organization.id}
          currencies={currencies}
          languages={languageOptions}
          authorisedIssuer={isAuthorisedIssuerNow(profile)}
          published={course.status === "published"}
          defaults={{
            title: course.title,
            summary: course.summary,
            descriptionHtml: course.descriptionHtml,
            category: course.category,
            skills: skills.map((s) => ({ value: s.id, label: s.name })),
            mode: course.mode,
            durationHours: course.durationHours,
            durationWeeks: course.durationWeeks,
            eligibility: course.eligibility,
            prerequisites: course.prerequisites,
            outcomes: course.outcomes,
            feeType: course.feeType,
            feeAmount: course.feeMinor !== null && course.feeCurrency ? fromMinorUnits(course.feeMinor, course.feeCurrency) : null,
            feeCurrency: course.feeCurrency,
            feeNotes: course.feeNotes,
            languages: languageOptions.filter((l) => course.languageCodes.includes(l.value)),
            certificationType: course.certificationType,
            accreditationBody: course.accreditationBody,
            cover: cover[0] ? toFileSummary(cover[0]) : null,
          }}
        />
      </SectionCard>
    </div>
  );
}
