import type { Metadata } from "next";

import { CourseForm } from "@/components/institution/course-form";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireOrgMember } from "@/modules/identity/authz";
import { getInstitutionProfile, isAuthorisedIssuerNow } from "@/modules/organizations/institution";
import { currencyOptions, listLanguages } from "@/modules/taxonomy/queries";

export const metadata: Metadata = { title: "New course" };

export default async function NewCoursePage() {
  const ctx = await requireOrgMember("institution", "institution.courses.manage");
  const [currencies, languages, profile] = await Promise.all([currencyOptions(), listLanguages(), getInstitutionProfile(ctx, ctx.organization.id).catch(() => null)]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="New course"
        description="Describe the course honestly: duration, eligibility, fees and exactly what learners can earn."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Courses", href: "/institution/courses" }, { label: "New course" }]}
      />
      {ctx.organization.status !== "verified" ? (
        <Callout tone="info" title="You can prepare courses before you are verified">
          Courses can be submitted for publication once Venkat Sai has verified your institution.
        </Callout>
      ) : null}
      <SectionCard title="Course details">
        <CourseForm
          organizationId={ctx.organization.id}
          currencies={currencies}
          languages={languages.map((l) => ({ value: l.code, label: l.name }))}
          authorisedIssuer={isAuthorisedIssuerNow(profile)}
        />
      </SectionCard>
    </div>
  );
}
