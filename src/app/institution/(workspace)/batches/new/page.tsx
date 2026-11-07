import type { Metadata } from "next";

import { BatchForm } from "@/components/institution/batch-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { requireOrgMember } from "@/modules/identity/authz";
import { countryOptions } from "@/modules/taxonomy/queries";

import { param, uuidParam, type SearchParams } from "../../_lib/params";
import { listCourseOptions } from "../../_lib/queries";

export const metadata: Metadata = { title: "Schedule a batch" };

export default async function NewBatchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", "institution.batches.manage");
  const sp = await searchParams;
  const [courses, countries] = await Promise.all([listCourseOptions(ctx), countryOptions()]);
  const requested = uuidParam(param(sp, "course"));
  const courseId = courses.some((c) => c.value === requested) ? requested : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule a batch"
        description="Set the dates, seats and venue. The batch starts as planned; open it for enrolment once the course is published."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Batches", href: "/institution/batches" }, { label: "Schedule a batch" }]}
      />
      <SectionCard title="Batch details">
        <BatchForm
          courseOptions={courses.map((c) => ({ value: c.value, label: c.status === "published" ? c.label : `${c.label} · not published yet` }))}
          countries={countries}
          defaults={{ courseId, timezone: ctx.user.timezone ?? env().DEFAULT_TIMEZONE, countryCode: ctx.organization.countryCode, city: ctx.organization.city }}
        />
      </SectionCard>
    </div>
  );
}
